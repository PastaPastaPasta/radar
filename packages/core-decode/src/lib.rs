//! Decodes raw Dash Core blocks and transactions into plain JSON-compatible objects.

pub mod decode;
pub mod model;

use serde::Serialize;
use wasm_bindgen::prelude::*;

fn to_js<T: Serialize>(v: &T) -> Result<JsValue, JsError> {
    v.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).map_err(|e| JsError::new(&e.to_string()))
}

/// Decodes a raw block (as returned by DAPI / `getblock <hash> 0`). Throws on malformed input.
#[wasm_bindgen(js_name = decodeBlock)]
pub fn decode_block(bytes: &[u8], network: &str) -> Result<JsValue, JsError> {
    let net = decode::parse_network(network).map_err(|e| JsError::new(&e))?;
    to_js(&decode::decode_block(bytes, net).map_err(|e| JsError::new(&e))?)
}

/// Decodes a raw transaction. Throws on malformed input.
#[wasm_bindgen(js_name = decodeTx)]
pub fn decode_tx(bytes: &[u8], network: &str) -> Result<JsValue, JsError> {
    let net = decode::parse_network(network).map_err(|e| JsError::new(&e))?;
    to_js(&decode::decode_tx(bytes, net).map_err(|e| JsError::new(&e))?)
}
