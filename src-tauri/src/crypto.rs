use keyring::Entry;

const SERVICE: &str = "novel-studio";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| format!("创建 keychain entry 失败: {}", e))
}

/// 存储 API key 到系统钥匙串
#[tauri::command]
pub fn keychain_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| format!("写入钥匙串失败: {}", e))
}

/// 从系统钥匙串读取 API key
#[tauri::command]
pub fn keychain_get(key: String) -> Result<String, String> {
    entry(&key)?.get_password().map_err(|e| format!("读取钥匙串失败: {}", e))
}

/// 从系统钥匙串删除 API key
#[tauri::command]
pub fn keychain_delete(key: String) -> Result<(), String> {
    entry(&key)?.delete_credential().map_err(|e| format!("删除钥匙串失败: {}", e))
}
