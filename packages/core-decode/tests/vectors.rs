//! Decoder tests on vectors from rust-dashcore's own test data (see tests/vectors/README.md).

use dashcore::blockdata::transaction::special_transaction::asset_unlock::qualified_asset_unlock::AssetUnlockPayload;
use dashcore::blockdata::transaction::special_transaction::asset_unlock::request_info::AssetUnlockRequestInfo;
use dashcore::blockdata::transaction::special_transaction::asset_unlock::unqualified_asset_unlock::AssetUnlockBasePayload;
use dashcore::blockdata::transaction::special_transaction::mnhf_signal::MnhfSignalPayload;
use dashcore::blockdata::transaction::special_transaction::provider_update_revocation::ProviderUpdateRevocationPayload;
use dashcore::blockdata::transaction::special_transaction::TransactionPayload;
use dashcore::bls_sig_utils::BLSSignature;
use dashcore::consensus::serialize;
use dashcore::hash_types::{InputsHash, QuorumHash};
use dashcore::{Network, OutPoint, ScriptBuf, Transaction, TxIn, TxOut, Txid};
use radar_core_decode::decode::{decode_block, decode_tx};
use serde_json::Value;
use std::fs;
use std::str::FromStr;

fn vec_bytes(name: &str) -> Vec<u8> {
    let path = format!("{}/tests/vectors/{name}", env!("CARGO_MANIFEST_DIR"));
    let raw = fs::read(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
    if name.ends_with(".raw") {
        raw
    } else {
        hex::decode(String::from_utf8(raw).unwrap().trim()).unwrap()
    }
}

fn tx_json(name: &str, net: Network) -> Value {
    serde_json::to_value(decode_tx(&vec_bytes(name), net).unwrap()).unwrap()
}

fn block_json(name: &str, net: Network) -> Value {
    serde_json::to_value(decode_block(&vec_bytes(name), net).unwrap()).unwrap()
}

fn built_tx(version: u16, payload: TransactionPayload, input: Vec<TxIn>, output: Vec<TxOut>) -> Vec<u8> {
    serialize(&Transaction {
        version,
        lock_time: 0,
        input,
        output,
        special_transaction_payload: Some(payload),
    })
}

#[test]
fn pro_reg_tx_v3_one_payout_devnet() {
    let v = tx_json("pro_reg_tx_v3_one_payout.hex", Network::Devnet);
    assert_eq!(v["txid"], "20814c480e94dce7f3fe3f3370ec6bacd1fdc4f446f17aa7de7886be0b5d07c2");
    assert_eq!(v["txType"], 1);
    assert_eq!(v["txTypeName"], "proRegTx");
    let p = &v["payload"];
    assert_eq!(p["kind"], "proRegTx");
    assert_eq!(p["version"], 3);
    assert_eq!(p["masternodeType"], 0);
    assert!(p["scriptPayout"].is_null());
    assert_eq!(p["payouts"][0]["script"]["address"], "yQohnoFhM5avKnzVzAX79xT8uCKviaPxj4");
    assert_eq!(p["payouts"][0]["reward"], 10000);
    assert_eq!(p["service"]["netInfo"]["version"], 1);
    assert!(p["service"]["address"].is_null());
    assert!(p["platformNodeId"].is_null());
    assert_eq!(p["operatorPublicKey"].as_str().unwrap().len(), 96);
}

#[test]
fn pro_reg_tx_v3_two_payouts_and_p2sh() {
    let v = tx_json("pro_reg_tx_v3_two_payouts.hex", Network::Devnet);
    assert_eq!(v["txid"], "f7e6fad0084ae34e410a8b710e5d74c0af1b95a29c1f3ae5507bed8e08b38adb");
    let rewards: Vec<_> = v["payload"]["payouts"].as_array().unwrap().iter().map(|s| s["reward"].as_u64().unwrap()).collect();
    assert_eq!(rewards, [6000, 4000]);

    let v = tx_json("pro_reg_tx_v3_p2sh_payout.hex", Network::Devnet);
    assert_eq!(v["txid"], "1bff9d395c2647e370202e87c80fa3942930567d217238392363cd2542fb496f");
    assert_eq!(v["payload"]["payouts"][0]["script"]["scriptType"], "p2sh");
    assert_eq!(v["payload"]["payouts"][0]["script"]["address"], "8yyRcXHGCXypDWTCNZMHUYZJJEC87GqLfK");
}

#[test]
fn pro_reg_tx_legacy_layouts() {
    let v = tx_json("proreg_testnet_v1.hex", Network::Testnet);
    assert_eq!(v["txid"], "e65f550356250100513aa9c260400562ac8ee1b93ae1cc1214cc9f6830227b51");
    let p = &v["payload"];
    assert_eq!(p["kind"], "proRegTx");
    assert_eq!(p["version"], 1);
    assert!(p["service"]["address"].as_str().unwrap().contains(':'));
    assert!(p["service"]["netInfo"].is_null());
    assert_eq!(p["scriptPayout"]["scriptType"], "p2pkh");
    assert!(p["scriptPayout"]["address"].as_str().unwrap().starts_with('y'));
    assert!(p["ownerKey"]["address"].as_str().unwrap().starts_with('y'));
    assert!(p["payouts"].is_null() && p["sharedCollateral"].is_null());

    let v = tx_json("proreg_testnet_collateral_in_tx.hex", Network::Testnet);
    assert_eq!(v["payload"]["kind"], "proRegTx");
}

#[test]
fn pro_up_serv_tx() {
    let v = tx_json("evo_pro_up_serv_tx_v3.hex", Network::Devnet);
    assert_eq!(v["txid"], "7c58d9776ef31869b8cae3f94366e9fedb914e41a5b4c26d048c12f30f5e51ac");
    let p = &v["payload"];
    assert_eq!(p["kind"], "proUpServTx");
    assert_eq!(p["version"], 3);
    assert_eq!(p["mnType"], 1);
    assert_eq!(p["platformNodeId"], "f958365178aaf234a101db3a34025bdf5f6ed315");
    assert_eq!(p["service"]["address"], "68.67.122.237:20001");
    let purposes = p["service"]["netInfo"]["purposes"].as_array().unwrap();
    let ports: Vec<_> = purposes.iter().map(|x| (x["purpose"].as_str().unwrap(), x["entries"][0]["port"].as_u64().unwrap())).collect();
    assert_eq!(ports, [("coreP2P", 20001), ("platformP2P", 26656), ("platformHttps", 1443)]);
    assert_eq!(p["payloadSig"].as_str().unwrap().len(), 192);

    let v = tx_json("proupserv_testnet_v1.hex", Network::Testnet);
    assert_eq!(v["payload"]["kind"], "proUpServTx");
    assert_eq!(v["payload"]["version"], 1);
    assert!(v["payload"]["service"]["address"].is_string());
}

#[test]
fn pro_up_reg_tx() {
    let v = tx_json("pro_up_reg_tx_v3.hex", Network::Devnet);
    assert_eq!(v["txid"], "16b69f49a4aba21954e199efe7209478763133f7c473fab6668d5d2b79e55775");
    let p = &v["payload"];
    assert_eq!(p["kind"], "proUpRegTx");
    assert_eq!(p["proTxHash"], "20814c480e94dce7f3fe3f3370ec6bacd1fdc4f446f17aa7de7886be0b5d07c2");
    assert_eq!(p["payouts"][0]["script"]["address"], "yT7ShTqEqPBskpTAiHzWaAggFmD4j1MCT3");

    let v = tx_json("proupreg_testnet_v1.hex", Network::Testnet);
    assert_eq!(v["txid"], "bd98378ca37d3ae6f4850b82e77be675feb3c9bc6e33cb0c23de1b38a08034c7");
    let p = &v["payload"];
    assert_eq!(p["version"], 1);
    assert_eq!(p["proTxHash"], "3dbb7de94e219e8f7eaea4f3c01cf97d77372e10152734c1959f17302369aa49");
    assert_eq!(p["providerMode"], 0);
    assert_eq!(p["operatorPublicKey"], "139b654f0b1c031e1cf2b934c2d895178875cfe7c6a4f6758f02bc66eea7fc292d0040701acbe31f5e14a911cb061a2f");
}

#[test]
fn pro_up_rev_tx_built_with_rust_dashcore() {
    let hash = Txid::from_str("3dbb7de94e219e8f7eaea4f3c01cf97d77372e10152734c1959f17302369aa49").unwrap();
    let bytes = built_tx(
        3,
        TransactionPayload::ProviderUpdateRevocationPayloadType(ProviderUpdateRevocationPayload {
            version: 1,
            pro_tx_hash: hash,
            reason: 2,
            inputs_hash: InputsHash::all_zeros(),
            payload_sig: BLSSignature::from([7; 96]),
        }),
        vec![TxIn {
            previous_output: OutPoint { txid: hash, vout: 1 },
            script_sig: ScriptBuf::new(),
            sequence: 0xffff_fffe,
            witness: Default::default(),
        }],
        vec![],
    );
    let v = serde_json::to_value(decode_tx(&bytes, Network::Mainnet).unwrap()).unwrap();
    assert_eq!(v["txType"], 4);
    assert_eq!(v["txTypeName"], "proUpRevTx");
    let p = &v["payload"];
    assert_eq!(p["kind"], "proUpRevTx");
    assert_eq!(p["proTxHash"], hash.to_string());
    assert_eq!(p["reason"], 2);
    assert_eq!(p["payloadSig"], "07".repeat(96));
}

#[test]
fn cbtx_in_blocks_and_standalone() {
    let v = tx_json("cbtx_mainnet_block_27facf.hex", Network::Mainnet);
    assert_eq!(v["isCoinbase"], true);
    assert_eq!(v["txTypeName"], "cbTx");
    assert!(v["coinbase"]["text"].as_str().unwrap().contains("/poolin.com/"));
    assert_eq!(v["payload"]["kind"], "cbTx");
    assert_eq!(v["payload"]["height"], 0x1cac41);
    // Dash Core prints merkleRootMNList / merkleRootQuorums byte-reversed from the wire.
    let wire = vec_bytes("cbtx_mainnet_block_27facf.hex");
    assert_eq!(v["payload"]["version"], 2);
    assert_eq!(v["payload"]["bestClHeight"], serde_json::Value::Null);
    let payload = &wire[wire.len() - 70..];
    let mut root = payload[6..38].to_vec();
    root.reverse();
    assert_eq!(v["payload"]["merkleRootMnList"], hex::encode(root));
}

#[test]
fn v24_devnet_blocks_decode_fully() {
    let b = block_json("block_15000.hex", Network::Devnet);
    assert_eq!(b["txCount"], 3);
    assert_eq!(b["txs"][0]["payload"]["kind"], "cbTx");
    assert_eq!(b["txs"][0]["payload"]["version"], 4);
    assert_eq!(b["txs"][0]["payload"]["height"], 15000);
    assert_eq!(b["txs"][0]["payload"]["merkleRootAssetUnlocks"], "00".repeat(32));
    assert_eq!(b["txs"][1]["payload"]["kind"], "qcTx");
    assert_eq!(b["size"], vec_bytes("block_15000.hex").len());

    for (name, height, kind) in [
        ("block_15146.hex", 15146, "proRegTx"),
        ("block_15153.hex", 15153, "proRegTx"),
        ("block_15166.hex", 15166, "proRegTx"),
        ("block_15182.hex", 15182, "proUpServTx"),
        ("block_15190.hex", 15190, "proUpRegTx"),
    ] {
        let b = block_json(name, Network::Devnet);
        assert_eq!(b["txs"][0]["payload"]["height"], height, "{name}");
        assert!(b["txs"].as_array().unwrap().iter().any(|t| t["payload"]["kind"] == kind), "{name}");
        assert_eq!(b["txCount"], b["txs"].as_array().unwrap().len());
    }
}

#[test]
fn quorum_commitment_tx() {
    let b = block_json("block_15000.hex", Network::Devnet);
    let tx = &b["txs"][1];
    assert_eq!(tx["txTypeName"], "qcTx");
    let p = &tx["payload"];
    let c = &p["commitment"];
    assert_eq!(p["version"], 1);
    assert!(p["height"].as_u64().unwrap() >= 14000 && p["height"].as_u64().unwrap() <= 15000);
    assert!(c["llmqType"].as_u64().unwrap() > 0);
    assert!(c["signers"].as_str().unwrap().len() as u64 >= c["signersCount"].as_u64().unwrap());
    assert_eq!(c["quorumPublicKey"].as_str().unwrap().len(), 96);
    assert_eq!(c["thresholdSig"].as_str().unwrap().len(), 192);
    assert_eq!(c["allCommitmentAggregatedSignature"].as_str().unwrap().len(), 192);
    assert_eq!(c["quorumHash"].as_str().unwrap().len(), 64);
    assert!(c["validMembersCount"].as_u64().unwrap() <= c["validMembers"].as_str().unwrap().len() as u64);
}

#[test]
fn testnet_blocks_hash_with_x11() {
    let b = block_json("testnet_block_000000008650f09124958e7352f844f9c15705171ac38ee6668534c5c238b916.raw", Network::Testnet);
    assert_eq!(b["hash"], "000000008650f09124958e7352f844f9c15705171ac38ee6668534c5c238b916");
    assert_eq!(b["txs"][0]["payload"]["kind"], "cbTx");
    assert!(b["txs"][1]["outputs"][0]["address"].as_str().unwrap().starts_with('y'));
    let b = block_json("testnet_block_000000230d699c59cacfeeb978940f1352f188b2f778f0168df45c5fa4e93dd2.raw", Network::Testnet);
    assert_eq!(b["hash"], "000000230d699c59cacfeeb978940f1352f188b2f778f0168df45c5fa4e93dd2");
    assert_eq!(b["txs"][1]["payload"]["kind"], "qcTx");
}

#[test]
fn classic_block_has_no_payloads() {
    let b = block_json("block_13b8a.hex", Network::Mainnet);
    assert_eq!(b["hash"], "9626a46fd7061bebdb53fcf89a7a010ac7cecbd2fb2210364ec0f8396390f68d");
    assert_eq!(b["txCount"], 9);
    for t in b["txs"].as_array().unwrap() {
        assert_eq!(t["txTypeName"], "classic");
        assert!(t["payload"].is_null());
    }
}

#[test]
fn asset_lock_tx() {
    let v = tx_json("assetlock_mainnet_core.hex", Network::Mainnet);
    assert_eq!(v["txid"], "81a1d138a3af6271d7fc4fef44cfd4d3b68fc8028dc208053bdae59f5dcc5581");
    assert_eq!(v["txType"], 8);
    let p = &v["payload"];
    assert_eq!(p["kind"], "assetLockTx");
    assert_eq!(p["version"], 1);
    assert_eq!(p["creditOutputs"][0]["value"], 197_000);
    assert_eq!(p["totalCredit"], 197_000);
    assert!(p["creditOutputs"][0]["address"].as_str().unwrap().starts_with('X'));
    assert_eq!(v["outputs"][0]["scriptType"], "nulldata");
    assert!(v["outputs"][0]["address"].is_null());
}

#[test]
fn mnhf_signal_tx_built_with_rust_dashcore() {
    // Payload from rust-dashcore's mnhf_signal.rs test of a failing real-world payload.
    let bytes = built_tx(
        3,
        TransactionPayload::MnhfSignalPayloadType(MnhfSignalPayload {
            version: 1,
            version_bit: 11,
            quorum_hash: QuorumHash::from_str("dd1ec5c4a8db99beced78f2c16565d31458bbf4771a55f552900000000000000").unwrap(),
            sig: BLSSignature::from([42; 96]),
        }),
        vec![],
        vec![],
    );
    let v = serde_json::to_value(decode_tx(&bytes, Network::Mainnet).unwrap()).unwrap();
    assert_eq!(v["txType"], 7);
    let p = &v["payload"];
    assert_eq!(p["kind"], "mnhfTx");
    assert_eq!(p["version"], 1);
    assert_eq!(p["versionBit"], 11);
    assert_eq!(p["quorumHash"], "dd1ec5c4a8db99beced78f2c16565d31458bbf4771a55f552900000000000000");
    assert_eq!(p["sig"], "2a".repeat(96));
}

#[test]
fn asset_unlock_tx_built_with_rust_dashcore() {
    // Values from rust-dashcore's qualified_asset_unlock.rs size test.
    let payload = AssetUnlockPayload {
        base: AssetUnlockBasePayload { version: 1, index: 301, fee: 70000 },
        request_info: AssetUnlockRequestInfo {
            request_height: 1317,
            quorum_hash: QuorumHash::from_str("4acfa5c6d92071d206da5b767039d42f24e7ab1a694a5b8014cddc088311e448").unwrap(),
        },
        quorum_sig: BLSSignature::from([9; 96]),
    };
    let script = ScriptBuf::from(hex::decode("76a914c35b782432294088e354bc28aa56d95736cb630288ac").unwrap());
    let bytes = built_tx(3, TransactionPayload::AssetUnlockPayloadType(payload), vec![], vec![TxOut { value: 200, script_pubkey: script }]);
    let v = serde_json::to_value(decode_tx(&bytes, Network::Mainnet).unwrap()).unwrap();
    assert_eq!(v["txType"], 9);
    assert_eq!(v["size"], bytes.len());
    let p = &v["payload"];
    assert_eq!(p["kind"], "assetUnlockTx");
    assert_eq!(p["index"], 301);
    assert_eq!(p["fee"], 70000);
    assert_eq!(p["requestHeight"], 1317);
    assert_eq!(p["quorumHash"], "4acfa5c6d92071d206da5b767039d42f24e7ab1a694a5b8014cddc088311e448");
    assert_eq!(p["quorumSig"], "09".repeat(96));
    assert_eq!(v["outputs"][0]["value"], 200);
    assert_eq!(v["outputs"][0]["scriptType"], "p2pkh");
}

#[test]
fn malformed_input_is_an_error_not_a_panic() {
    assert!(decode_tx(&[], Network::Mainnet).is_err());
    assert!(decode_tx(&[1, 2, 3], Network::Mainnet).is_err());
    let good = vec_bytes("block_13b8a.hex");
    assert!(decode_block(&good[..good.len() - 10], Network::Mainnet).is_err());
    let mut trailing = good.clone();
    trailing.push(0);
    assert!(decode_block(&trailing, Network::Mainnet).is_err());
    assert!(decode_block(&good[..60], Network::Mainnet).is_err());
    assert!(radar_core_decode::decode::parse_network("bogus").is_err());
}
