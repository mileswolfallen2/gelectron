use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::{Mutex, OnceLock};

pub struct NativeImageHandle {
    pub id: u32,
    pub width: u32,
    pub height: u32,
    pub rgba_data: Vec<u8>,
}

static IMAGE_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
static IMAGES: OnceLock<Mutex<Vec<NativeImageHandle>>> = OnceLock::new();

fn get_images() -> &'static Mutex<Vec<NativeImageHandle>> {
    IMAGES.get_or_init(|| Mutex::new(Vec::new()))
}

#[napi(object)]
pub struct ImageSize {
    pub width: u32,
    pub height: u32,
}

#[napi(object)]
pub struct ImageData {
    pub id: u32,
    pub width: u32,
    pub height: u32,
    pub to_png_data_uri: String,
}

#[napi]
pub fn native_image_create_from_path(path: String) -> Result<u32> {
    let img = image::open(&path).map_err(|e| Error::from_reason(e.to_string()))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();

    let id = IMAGE_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    get_images()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?
        .push(NativeImageHandle {
            id,
            width,
            height,
            rgba_data: rgba.into_raw(),
        });

    log::debug!("NativeImage {} created from path: {} ({}x{})", id, path, width, height);
    Ok(id)
}

#[napi]
pub fn native_image_create_from_buffer(
    buffer: Vec<u8>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<u32> {
    let img = image::load_from_memory(&buffer).map_err(|e| Error::from_reason(e.to_string()))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();

    let id = IMAGE_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    get_images()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?
        .push(NativeImageHandle {
            id,
            width: width.unwrap_or(w),
            height: height.unwrap_or(h),
            rgba_data: rgba.into_raw(),
        });

    log::debug!("NativeImage {} created from buffer ({}x{})", id, w, h);
    Ok(id)
}

#[napi]
pub fn native_image_create_empty() -> Result<u32> {
    let id = IMAGE_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    get_images()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?
        .push(NativeImageHandle {
            id,
            width: 0,
            height: 0,
            rgba_data: vec![],
        });
    Ok(id)
}

#[napi]
pub fn native_image_get_size(image_id: u32) -> Result<ImageSize> {
    let images = get_images()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let img = images
        .iter()
        .find(|i| i.id == image_id)
        .ok_or_else(|| Error::from_reason("Image not found".to_string()))?;
    Ok(ImageSize {
        width: img.width,
        height: img.height,
    })
}

#[napi]
pub fn native_image_to_png(image_id: u32) -> Result<Vec<u8>> {
    let images = get_images()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let img = images
        .iter()
        .find(|i| i.id == image_id)
        .ok_or_else(|| Error::from_reason("Image not found".to_string()))?;

    let rgba_img = image::RgbaImage::from_raw(img.width, img.height, img.rgba_data.clone())
        .ok_or_else(|| Error::from_reason("Failed to create RGBA image".to_string()))?;

    let mut buf = std::io::Cursor::new(Vec::new());
    rgba_img
        .write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(buf.into_inner())
}

#[napi]
pub fn native_image_to_jpeg(image_id: u32, quality: u32) -> Result<Vec<u8>> {
    let images = get_images()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let img = images
        .iter()
        .find(|i| i.id == image_id)
        .ok_or_else(|| Error::from_reason("Image not found".to_string()))?;

    let rgba_img = image::RgbaImage::from_raw(img.width, img.height, img.rgba_data.clone())
        .ok_or_else(|| Error::from_reason("Failed to create RGBA image".to_string()))?;

    let rgb_img = image::DynamicImage::ImageRgba8(rgba_img).to_rgb8();
    let mut buf = std::io::Cursor::new(Vec::new());
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality as u8);
    rgb_img
        .write_with_encoder(encoder)
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(buf.into_inner())
}

#[napi]
pub fn native_image_resize(
    image_id: u32,
    width: u32,
    height: u32,
) -> Result<u32> {
    let mut images = get_images()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let img = images
        .iter()
        .find(|i| i.id == image_id)
        .ok_or_else(|| Error::from_reason("Image not found".to_string()))?;

    let rgba_img = image::RgbaImage::from_raw(img.width, img.height, img.rgba_data.clone())
        .ok_or_else(|| Error::from_reason("Failed to create RGBA image".to_string()))?;

    let resized = image::imageops::resize(&rgba_img, width, height, image::imageops::FilterType::Lanczos3);
    let (rw, rh) = resized.dimensions();

    let new_id = IMAGE_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    images.push(NativeImageHandle {
        id: new_id,
        width: rw,
        height: rh,
        rgba_data: resized.into_raw(),
    });

    Ok(new_id)
}

#[napi]
pub fn native_image_crop(
    image_id: u32,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<u32> {
    let mut images = get_images()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let img = images
        .iter()
        .find(|i| i.id == image_id)
        .ok_or_else(|| Error::from_reason("Image not found".to_string()))?;

    let rgba_img = image::RgbaImage::from_raw(img.width, img.height, img.rgba_data.clone())
        .ok_or_else(|| Error::from_reason("Failed to create RGBA image".to_string()))?;

    let cropped = image::imageops::crop_imm(&rgba_img, x, y, width, height).to_image();

    let new_id = IMAGE_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    images.push(NativeImageHandle {
        id: new_id,
        width,
        height,
        rgba_data: cropped.into_raw(),
    });

    Ok(new_id)
}

#[napi]
pub fn native_image_set_template_image(image_id: u32, template: bool) -> Result<()> {
    log::debug!("NativeImage {} template={}", image_id, template);
    Ok(())
}

#[napi]
pub fn native_image_is_empty(image_id: u32) -> Result<bool> {
    let images = get_images()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(images
        .iter()
        .find(|i| i.id == image_id)
        .map(|i| i.rgba_data.is_empty())
        .unwrap_or(true))
}

#[napi]
pub fn native_image_destroy(image_id: u32) -> Result<()> {
    let mut images = get_images()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    images.retain(|i| i.id != image_id);
    Ok(())
}
