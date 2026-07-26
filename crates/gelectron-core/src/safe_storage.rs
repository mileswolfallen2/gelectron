use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn safe_storage_is_available() -> bool {
    true
}

#[napi]
pub fn safe_storage_encrypt_string(
    service_name: String,
    account: String,
    plaintext: String,
) -> Result<()> {
    let entry = keyring::Entry::new(&service_name, &account)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    entry
        .set_password(&plaintext)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    log::info!("Stored credentials for {}/{}", service_name, account);
    Ok(())
}

#[napi]
pub fn safe_storage_decrypt_string(
    service_name: String,
    account: String,
) -> Result<Option<String>> {
    let entry = keyring::Entry::new(&service_name, &account)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(Error::from_reason(e.to_string())),
    }
}

#[napi]
pub fn safe_storage_delete_item(
    service_name: String,
    account: String,
) -> Result<()> {
    let entry = keyring::Entry::new(&service_name, &account)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let _ = entry.delete_credential();
    log::info!("Deleted credentials for {}/{}", service_name, account);
    Ok(())
}
