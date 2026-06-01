use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub struct HttpClient(Mutex<Option<Client>>);

impl HttpClient {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }

    fn get_client(&self) -> Result<Client, String> {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if guard.is_none() {
            let client = Client::builder()
                .user_agent("NovelStudio/0.1")
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
            *guard = Some(client);
        }
        Ok(guard.as_ref().expect("HTTP client should be initialized").clone())
    }
}

/// 按字符边界安全截断字符串，避免切在 UTF-8 多字节字符中间
fn safe_truncate(s: &str, max_chars: usize) -> &str {
    if s.chars().count() <= max_chars { return s }
    let end = s.char_indices().nth(max_chars).map(|(i, _)| i).unwrap_or(s.len());
    &s[..end]
}

/// 活跃的 abort 标记，key 为请求 id
pub struct AbortFlags(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl AbortFlags {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    pub fn insert(&self, id: String, flag: Arc<AtomicBool>) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).insert(id, flag);
    }

    pub fn abort(&self, id: &str) {
        let mut map = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(flag) = map.get(id) {
            flag.store(true, Ordering::SeqCst);
        }
        map.remove(id);
    }

    pub fn remove(&self, id: &str) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).remove(id);
    }
}

// ────────── 非流式请求 ──────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyFetchRequest {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProxyFetchResponse {
    pub status: u16,
    pub body: String,
    pub ok: bool,
}

#[tauri::command]
pub async fn proxy_fetch(
    client: State<'_, HttpClient>,
    request: ProxyFetchRequest,
) -> Result<ProxyFetchResponse, String> {
    let http = client.get_client()?;

    let method = match request.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        other => return Err(format!("不支持的 HTTP 方法: {}", other)),
    };

    let mut req_builder = http.request(method, &request.url);

    for (key, value) in &request.headers {
        req_builder = req_builder.header(key.as_str(), value.as_str());
    }

    if let Some(body) = &request.body {
        req_builder = req_builder.body(body.clone());
    }

    let response = req_builder.send().await.map_err(|e| {
        // 输出完整错误链
        let mut msg = format!("{}", e);
        let mut source = std::error::Error::source(&e);
        while let Some(s) = source {
            msg = format!("{} | caused by: {}", msg, s);
            source = std::error::Error::source(s);
        }
        eprintln!("[proxy_fetch] 请求失败: {}", msg);
        format!("网络请求失败: {}", msg)
    })?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| format!("读取响应失败: {}", e))?;

    Ok(ProxyFetchResponse { status, body, ok: (200..300).contains(&status) })
}

// ────────── 流式请求 ──────────

#[derive(Debug, Clone, Serialize, Deserialize)]
enum SseFormat {
    #[serde(rename = "openai")]
    OpenAI,
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "gemini")]
    Gemini,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
enum StreamEvent {
    #[serde(rename = "chunk")]
    Chunk { data: String },
    #[serde(rename = "reasoning")]
    Reasoning { data: String },
    #[serde(rename = "done")]
    Done { full_text: String },
    #[serde(rename = "error")]
    Error { message: String },
}

#[tauri::command]
pub async fn proxy_fetch_stream(
    app: AppHandle,
    client: State<'_, HttpClient>,
    abort_flags: State<'_, AbortFlags>,
    request_id: String,
    request: ProxyFetchRequest,
    sse_format: Option<String>,
) -> Result<(), String> {
    let format: SseFormat = match sse_format.as_deref() {
        Some("anthropic") => SseFormat::Anthropic,
        Some("gemini") => SseFormat::Gemini,
        _ => SseFormat::OpenAI,
    };
    let abort_flag = Arc::new(AtomicBool::new(false));
    abort_flags.insert(request_id.clone(), abort_flag.clone());

    let http = client.get_client()?;

    let method = match request.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        other => {
            abort_flags.remove(&request_id);
            return Err(format!("不支持的 HTTP 方法: {}", other));
        }
    };

    let mut req_builder = http.request(method, &request.url);
    for (key, value) in &request.headers {
        req_builder = req_builder.header(key.as_str(), value.as_str());
    }
    if let Some(body) = &request.body {
        req_builder = req_builder.body(body.clone());
    }

    let response = match req_builder.send().await {
        Ok(r) => r,
        Err(e) => {
            abort_flags.remove(&request_id);
            let mut msg = format!("{}", e);
            let mut source = std::error::Error::source(&e);
            while let Some(s) = source {
                msg = format!("{} | caused by: {}", msg, s);
                source = std::error::Error::source(s);
            }
            let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Error {
                message: format!("网络请求失败: {}", msg),
            });
            return Err(format!("网络请求失败: {}", msg));
        }
    };

    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let body_text = response.text().await.unwrap_or_default();
        abort_flags.remove(&request_id);
        let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Error {
            message: format!("API 错误 ({}): {}", status, safe_truncate(&body_text, 200)),
        });
        return Err(format!("API 错误: {}", status));
    }

    // 逐块读取 SSE（B3: 字节缓冲，避免 UTF-8 跨 chunk 切断导致 U+FFFD）
    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut full_text = String::new();
    let mut byte_buf: Vec<u8> = Vec::new();

    while let Some(chunk_result) = stream.next().await {
        if abort_flag.load(Ordering::SeqCst) {
            abort_flags.remove(&request_id);
            let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Error {
                message: "用户取消".to_string(),
            });
            return Ok(());
        }

        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                abort_flags.remove(&request_id);
                let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Error {
                    message: format!("读取流失败: {}", e),
                });
                return Err(format!("读取流失败: {}", e));
            }
        };

        byte_buf.extend_from_slice(&chunk);

        // 按 \n 找到完整行再解码（使用 drain 避免 O(n²) 拷贝）
        while let Some(pos) = byte_buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = byte_buf.drain(..=pos).collect();
            // 去掉末尾的 \n
            let line_bytes = &line_bytes[..line_bytes.len() - 1];

            let line = match std::str::from_utf8(&line_bytes) {
                Ok(s) => s.trim().to_string(),
                Err(_) => continue, // 无效 UTF-8 行跳过
            };

            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                abort_flags.remove(&request_id);
                let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Done {
                    full_text: full_text.clone(),
                });
                return Ok(());
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                match &format {
                    // ── OpenAI 兼容 ──
                    SseFormat::OpenAI => {
                        if let Some(reasoning) = json.pointer("/choices/0/delta/reasoning_content").and_then(|v| v.as_str()) {
                            let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Reasoning {
                                data: reasoning.to_string(),
                            });
                        }
                        if let Some(delta) = json.pointer("/choices/0/delta/content").and_then(|v| v.as_str()) {
                            full_text.push_str(delta);
                            let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Chunk {
                                data: delta.to_string(),
                            });
                        }
                    }
                    // ── Anthropic ──
                    SseFormat::Anthropic => {
                        let event_type = json["type"].as_str().unwrap_or("");
                        match event_type {
                            "content_block_delta" => {
                                if let Some(text) = json.pointer("/delta/text").and_then(|v| v.as_str()) {
                                    full_text.push_str(text);
                                    let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Chunk {
                                        data: text.to_string(),
                                    });
                                }
                            }
                            "thinking_delta" => {
                                if let Some(thinking) = json.pointer("/delta/thinking").and_then(|v| v.as_str()) {
                                    let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Reasoning {
                                        data: thinking.to_string(),
                                    });
                                }
                            }
                            _ => {}
                        }
                    }
                    // ── Gemini ──
                    SseFormat::Gemini => {
                        if let Some(text) = json.pointer("/candidates/0/content/parts/0/text").and_then(|v| v.as_str()) {
                            full_text.push_str(text);
                            let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Chunk {
                                data: text.to_string(),
                            });
                        }
                        if let Some(thought) = json.pointer("/candidates/0/content/parts/0/thought").and_then(|v| v.as_str()) {
                            let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Reasoning {
                                data: thought.to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    // 流结束但没收到 [DONE]
    abort_flags.remove(&request_id);
    let _ = app.emit(&format!("stream:{}", request_id), StreamEvent::Done {
        full_text: full_text.clone(),
    });
    Ok(())
}

#[tauri::command]
pub async fn proxy_abort_stream(
    abort_flags: State<'_, AbortFlags>,
    request_id: String,
) -> Result<(), String> {
    abort_flags.abort(&request_id);
    Ok(())
}
