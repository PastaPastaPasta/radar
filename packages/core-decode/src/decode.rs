use crate::model::*;
use dashcore::blockdata::transaction::special_transaction::provider_registration::{
    MasternodePayoutShare, SharedCollateral,
};
use dashcore::blockdata::transaction::special_transaction::quorum_commitment::QuorumEntry;
use dashcore::blockdata::transaction::special_transaction::{TransactionPayload as P, TransactionType};
use dashcore::consensus::{deserialize, serialize, Decodable, Encodable};
use dashcore::sml::masternode_list_entry::net_info::{Bip155Network, NetInfoEntry, NetInfoPurpose};
use dashcore::sml::masternode_list_entry::MasternodeNetInfo;
use dashcore::hashes::hash160;
use dashcore::{Address, Block, Network, PubkeyHash, Script, ScriptBuf, Transaction, TxOut};

pub fn parse_network(s: &str) -> Result<Network, String> {
    match s.to_ascii_lowercase().as_str() {
        "mainnet" | "main" | "dash" | "livenet" => Ok(Network::Mainnet),
        "testnet" | "test" => Ok(Network::Testnet),
        "devnet" | "dev" => Ok(Network::Devnet),
        "regtest" => Ok(Network::Regtest),
        other => Err(format!("unknown network '{other}' (expected mainnet, testnet, devnet or regtest)")),
    }
}

pub fn decode_block(bytes: &[u8], network: Network) -> Result<BlockOut, String> {
    let block: Block = deserialize(bytes).map_err(|e| format!("block decode failed: {e}"))?;
    let h = &block.header;
    let txs: Vec<TxJson> = block.txdata.iter().map(|t| tx_out(t, network)).collect();
    let coinbase = txs.first().and_then(|t| t.coinbase.clone());
    Ok(BlockOut {
        hash: h.block_hash().to_string(),
        version: h.version.to_consensus(),
        prev_block_hash: h.prev_blockhash.to_string(),
        merkle_root: h.merkle_root.to_string(),
        time: h.time,
        bits: h.bits.to_consensus(),
        nonce: h.nonce,
        size: bytes.len(),
        tx_count: txs.len(),
        coinbase,
        txs,
    })
}

pub fn decode_tx(bytes: &[u8], network: Network) -> Result<TxJson, String> {
    let tx: Transaction = deserialize(bytes).map_err(|e| format!("transaction decode failed: {e}"))?;
    Ok(tx_out(&tx, network))
}

fn tx_out(tx: &Transaction, network: Network) -> TxJson {
    let (tx_type, name) = type_info(&tx.tx_type());
    let is_coinbase = tx.is_coin_base();
    let coinbase = if is_coinbase {
        tx.input.first().map(|i| CoinbaseOut {
            script_sig_hex: hex::encode(i.script_sig.as_bytes()),
            text: script_text(i.script_sig.as_bytes()),
        })
    } else {
        None
    };
    TxJson {
        txid: tx.txid().to_string(),
        version: tx.version,
        tx_type,
        tx_type_name: name,
        lock_time: tx.lock_time,
        size: tx.size(),
        is_coinbase,
        coinbase,
        inputs: tx
            .input
            .iter()
            .map(|i| InputOut {
                prev_txid: i.previous_output.txid.to_string(),
                vout: i.previous_output.vout,
                script_sig_hex: hex::encode(i.script_sig.as_bytes()),
                script_sig_asm: i.script_sig.to_asm_string(),
                sequence: i.sequence,
            })
            .collect(),
        outputs: tx.output.iter().enumerate().map(|(n, o)| output_out(n, o, network)).collect(),
        payload: tx.special_transaction_payload.as_ref().and_then(|p| payload_out(p, network)),
    }
}

fn type_info(t: &TransactionType) -> (u16, &'static str) {
    use TransactionType::*;
    match t {
        Classic | ClassicalWithNonStandardVersionTypeBytes(_) => (0, "classic"),
        ProviderRegistration => (1, "proRegTx"),
        ProviderUpdateService => (2, "proUpServTx"),
        ProviderUpdateRegistrar => (3, "proUpRegTx"),
        ProviderUpdateRevocation => (4, "proUpRevTx"),
        Coinbase => (5, "cbTx"),
        QuorumCommitment => (6, "qcTx"),
        MnhfSignal => (7, "mnhfTx"),
        AssetLock => (8, "assetLockTx"),
        AssetUnlock => (9, "assetUnlockTx"),
        ProviderDissolve => (10, "proDissolveTx"),
        ProviderUpdateShare => (11, "proUpShareTx"),
        ProviderUpdateSharedRegistrar => (12, "proUpSharedRegTx"),
        Unknown(n) => (*n, "unknown"),
    }
}

fn script_text(bytes: &[u8]) -> String {
    let lossy = String::from_utf8_lossy(bytes);
    let mut out = String::new();
    let mut gap = false;
    for c in lossy.chars() {
        if c.is_control() || c == char::REPLACEMENT_CHARACTER {
            gap = true;
        } else {
            if gap && !out.is_empty() {
                out.push(' ');
            }
            gap = false;
            out.push(c);
        }
    }
    out
}

fn script_type(s: &Script) -> &'static str {
    if s.is_p2pkh() {
        "p2pkh"
    } else if s.is_p2sh() {
        "p2sh"
    } else if s.is_p2pk() {
        "p2pk"
    } else if s.is_op_return() {
        "nulldata"
    } else if s.is_empty() {
        "empty"
    } else {
        "nonstandard"
    }
}

fn address_of(s: &ScriptBuf, network: Network) -> Option<String> {
    if s.is_p2pk() {
        let b = s.as_bytes();
        let p2pkh = ScriptBuf::new_p2pkh(&PubkeyHash::from_raw_hash(hash160::Hash::hash(&b[1..b.len() - 1])));
        return Address::from_script(&p2pkh, network).ok().map(|a| a.to_string());
    }
    Address::from_script(s, network).ok().map(|a| a.to_string())
}

fn output_out(n: usize, o: &TxOut, network: Network) -> OutputOut {
    OutputOut {
        n,
        value: o.value,
        script_pub_key_hex: hex::encode(o.script_pubkey.as_bytes()),
        script_pub_key_asm: o.script_pubkey.to_asm_string(),
        script_type: script_type(&o.script_pubkey),
        address: address_of(&o.script_pubkey, network),
    }
}

fn script_out(s: &ScriptBuf, network: Network) -> ScriptOut {
    ScriptOut {
        hex: hex::encode(s.as_bytes()),
        script_type: script_type(s),
        address: address_of(s, network),
    }
}

fn opt_script(s: &ScriptBuf, network: Network) -> Option<ScriptOut> {
    if s.is_empty() {
        None
    } else {
        Some(script_out(s, network))
    }
}

fn enc_hex<T: Encodable>(v: &T) -> String {
    hex::encode(serialize(v))
}

/// Hex in Dash Core's display order for hash types whose `Display` prints wire order.
fn core_hex<T: Encodable>(v: &T) -> String {
    let mut b = serialize(v);
    b.reverse();
    hex::encode(b)
}

fn key_out(h: &PubkeyHash, network: Network) -> KeyHashOut {
    let script = ScriptBuf::new_p2pkh(h);
    KeyHashOut {
        hash: enc_hex(h),
        address: address_of(&script, network).unwrap_or_default(),
    }
}

fn payouts_out(p: &Option<Vec<MasternodePayoutShare>>, network: Network) -> Option<Vec<PayoutShareOut>> {
    p.as_ref().map(|v| {
        v.iter()
            .map(|s| PayoutShareOut {
                script: script_out(&s.script_payout, network),
                reward: s.reward,
            })
            .collect()
    })
}

fn shared_out(s: &SharedCollateral, network: Network) -> SharedCollateralOut {
    SharedCollateralOut {
        shares: s
            .shares
            .iter()
            .map(|c| CollateralShareOut {
                amount: c.amount,
                script_refund: script_out(&c.script_refund, network),
                script_reward: script_out(&c.script_reward, network),
                owner_key: key_out(&c.owner_key_hash, network),
            })
            .collect(),
        join_sigs: s.join_sigs.iter().map(enc_hex).collect(),
        early_period_blocks: s.early_period_blocks,
        early_penalty: s.early_penalty,
    }
}

fn service_out(n: &MasternodeNetInfo) -> ServiceOut {
    match n {
        MasternodeNetInfo::Legacy(addr) => ServiceOut {
            address: Some(addr.to_string()),
            net_info: None,
        },
        MasternodeNetInfo::Extended(ext) => {
            let purposes: Vec<NetInfoPurposeOut> = ext
                .purposes
                .iter()
                .map(|(p, entries)| NetInfoPurposeOut {
                    purpose: match p {
                        NetInfoPurpose::CoreP2P => "coreP2P",
                        NetInfoPurpose::PlatformP2P => "platformP2P",
                        NetInfoPurpose::PlatformHttps => "platformHttps",
                    },
                    entries: entries.iter().map(entry_out).collect(),
                })
                .collect();
            let address = purposes
                .iter()
                .find(|p| p.purpose == "coreP2P")
                .and_then(|p| p.entries.first())
                .and_then(|e| match (&e.address, &e.host, e.port) {
                    (Some(a), _, Some(port)) => Some(fmt_host_port(a, port)),
                    (_, Some(h), Some(port)) => Some(format!("{h}:{port}")),
                    _ => None,
                });
            ServiceOut {
                address,
                net_info: Some(NetInfoOut {
                    version: ext.version,
                    purposes,
                }),
            }
        }
    }
}

fn fmt_host_port(addr: &str, port: u16) -> String {
    if addr.contains(':') {
        format!("[{addr}]:{port}")
    } else {
        format!("{addr}:{port}")
    }
}

fn entry_out(e: &NetInfoEntry) -> NetInfoEntryOut {
    match e {
        NetInfoEntry::Service { network, addr, port } => {
            let (name, text) = match network {
                Bip155Network::Ipv4 if addr.len() == 4 => {
                    ("ipv4", std::net::Ipv4Addr::new(addr[0], addr[1], addr[2], addr[3]).to_string())
                }
                Bip155Network::Ipv6 if addr.len() == 16 => {
                    let mut b = [0u8; 16];
                    b.copy_from_slice(addr);
                    ("ipv6", std::net::Ipv6Addr::from(b).to_string())
                }
                Bip155Network::Ipv4 => ("ipv4", hex::encode(addr)),
                Bip155Network::Ipv6 => ("ipv6", hex::encode(addr)),
                Bip155Network::TorV3 => ("torv3", hex::encode(addr)),
                Bip155Network::I2p => ("i2p", hex::encode(addr)),
                Bip155Network::Cjdns => ("cjdns", hex::encode(addr)),
            };
            NetInfoEntryOut {
                kind: "service",
                network: Some(name),
                address: Some(text),
                host: None,
                port: Some(*port),
            }
        }
        NetInfoEntry::Domain { host, port } => NetInfoEntryOut {
            kind: "domain",
            network: None,
            address: None,
            host: Some(host.clone()),
            port: Some(*port),
        },
        NetInfoEntry::Invalid => NetInfoEntryOut {
            kind: "invalid",
            network: None,
            address: None,
            host: None,
            port: None,
        },
    }
}

fn bits_string(v: &[bool]) -> String {
    v.iter().map(|b| if *b { '1' } else { '0' }).collect()
}

fn quorum_entry_out(q: &QuorumEntry) -> QuorumEntryOut {
    QuorumEntryOut {
        version: q.version,
        llmq_type: q.llmq_type.index(),
        llmq_type_name: q.llmq_type.to_string(),
        quorum_hash: q.quorum_hash.to_string(),
        quorum_index: q.quorum_index,
        signers_count: q.signers.iter().filter(|b| **b).count(),
        valid_members_count: q.valid_members.iter().filter(|b| **b).count(),
        signers: bits_string(&q.signers),
        valid_members: bits_string(&q.valid_members),
        quorum_public_key: enc_hex(&q.quorum_public_key),
        quorum_vvec_hash: q.quorum_vvec_hash.to_string(),
        threshold_sig: enc_hex(&q.threshold_sig),
        all_commitment_aggregated_signature: enc_hex(&q.all_commitment_aggregated_signature),
    }
}

fn payload_out(p: &P, network: Network) -> Option<PayloadOut> {
    Some(match p {
        P::ProviderRegistrationPayloadType(p) => PayloadOut::ProRegTx {
            version: p.version,
            masternode_type: p.masternode_type as u16,
            masternode_mode: p.masternode_mode,
            collateral_in_tx: p.collateral_outpoint.txid.to_byte_array() == [0u8; 32],
            collateral_outpoint: OutPointOut {
                txid: p.collateral_outpoint.txid.to_string(),
                vout: p.collateral_outpoint.vout,
            },
            service: service_out(&p.service_address),
            owner_key: key_out(&p.owner_key_hash, network),
            operator_public_key: enc_hex(&p.operator_public_key),
            voting_key: key_out(&p.voting_key_hash, network),
            operator_reward: p.operator_reward,
            script_payout: opt_script(&p.script_payout, network),
            payouts: payouts_out(&p.payouts, network),
            shared_collateral: p.shared_collateral.as_ref().map(|s| shared_out(s, network)),
            inputs_hash: p.inputs_hash.to_string(),
            platform_node_id: p.platform_node_id.map(|n| n.to_string()),
            platform_p2p_port: p.platform_p2p_port,
            platform_http_port: p.platform_http_port,
            signature: hex::encode(&p.signature),
        },
        P::ProviderUpdateServicePayloadType(p) => PayloadOut::ProUpServTx {
            version: p.version,
            mn_type: p.mn_type,
            pro_tx_hash: p.pro_tx_hash.to_string(),
            service: service_out(&p.service_address),
            script_operator_payout: opt_script(&p.script_payout, network),
            inputs_hash: p.inputs_hash.to_string(),
            platform_node_id: p.platform_node_id.map(|n| n.to_string()),
            platform_p2p_port: p.platform_p2p_port,
            platform_http_port: p.platform_http_port,
            payload_sig: enc_hex(&p.payload_sig),
        },
        P::ProviderUpdateRegistrarPayloadType(p) => PayloadOut::ProUpRegTx {
            version: p.version,
            pro_tx_hash: p.pro_tx_hash.to_string(),
            provider_mode: p.provider_mode,
            operator_public_key: enc_hex(&p.operator_public_key),
            voting_key: key_out(&p.voting_key_hash, network),
            script_payout: opt_script(&p.script_payout, network),
            payouts: payouts_out(&p.payouts, network),
            inputs_hash: p.inputs_hash.to_string(),
            payload_sig: hex::encode(&p.payload_sig),
        },
        P::ProviderUpdateRevocationPayloadType(p) => PayloadOut::ProUpRevTx {
            version: p.version,
            pro_tx_hash: p.pro_tx_hash.to_string(),
            reason: p.reason,
            inputs_hash: p.inputs_hash.to_string(),
            payload_sig: enc_hex(&p.payload_sig),
        },
        P::CoinbasePayloadType(p) => PayloadOut::CbTx {
            version: p.version,
            height: p.height,
            merkle_root_mn_list: core_hex(&p.merkle_root_masternode_list),
            merkle_root_quorums: (p.version >= 2).then(|| core_hex(&p.merkle_root_quorums)),
            best_cl_height_diff: p.best_cl_height,
            best_cl_height: p
                .best_cl_height
                .and_then(|d| p.height.checked_sub(d).and_then(|x| x.checked_sub(1))),
            best_cl_signature: p.best_cl_signature.as_ref().map(enc_hex),
            credit_pool_balance: p.asset_locked_amount,
            merkle_root_asset_unlocks: p.merkle_root_asset_unlocks.as_ref().map(core_hex),
        },
        P::QuorumCommitmentPayloadType(p) => {
            // The payload's fields are private, so read them back from its encoding.
            let raw = serialize(p);
            let mut r = raw.as_slice();
            let parsed = u16::consensus_decode(&mut r).and_then(|version| {
                let height = u32::consensus_decode(&mut r)?;
                let entry = QuorumEntry::consensus_decode(&mut r)?;
                Ok((version, height, entry))
            });
            match parsed {
                Ok((version, height, entry)) => PayloadOut::QcTx {
                    version,
                    height,
                    commitment: quorum_entry_out(&entry),
                },
                Err(_) => PayloadOut::Raw {
                    tx_type: 6,
                    hex: hex::encode(raw),
                },
            }
        }
        P::MnhfSignalPayloadType(p) => PayloadOut::MnhfTx {
            version: p.version,
            version_bit: p.version_bit,
            quorum_hash: p.quorum_hash.to_string(),
            sig: enc_hex(&p.sig),
        },
        P::AssetLockPayloadType(p) => PayloadOut::AssetLockTx {
            version: p.version,
            credit_outputs: p.credit_outputs.iter().enumerate().map(|(n, o)| output_out(n, o, network)).collect(),
            total_credit: p.credit_outputs.iter().fold(0u64, |n, o| n.saturating_add(o.value)),
        },
        P::AssetUnlockPayloadType(p) => PayloadOut::AssetUnlockTx {
            version: p.base.version,
            index: p.base.index,
            fee: p.base.fee,
            request_height: p.request_info.request_height,
            quorum_hash: p.request_info.quorum_hash.to_string(),
            quorum_sig: enc_hex(&p.quorum_sig),
        },
        P::ProviderDissolvePayloadType(p) => PayloadOut::ProDissolveTx {
            version: p.version,
            pro_tx_hash: p.pro_tx_hash.to_string(),
            actor_index: p.actor_index,
            signatures: p.signatures.iter().map(enc_hex).collect(),
        },
        P::ProviderUpdateSharePayloadType(p) => PayloadOut::ProUpShareTx {
            version: p.version,
            pro_tx_hash: p.pro_tx_hash.to_string(),
            share_index: p.share_index,
            script_reward: opt_script(&p.script_reward, network),
            inputs_hash: p.inputs_hash.to_string(),
            payload_sig: hex::encode(&p.payload_sig),
        },
        P::ProviderUpdateSharedRegistrarPayloadType(p) => PayloadOut::ProUpSharedRegTx {
            version: p.version,
            pro_tx_hash: p.pro_tx_hash.to_string(),
            operator_public_key: enc_hex(&p.operator_public_key),
            voting_key: key_out(&p.voting_key_hash, network),
            inputs_hash: p.inputs_hash.to_string(),
            signatures: p.signatures.iter().map(enc_hex).collect(),
        },
        P::RawPayloadType(t, bytes) => PayloadOut::Raw {
            tx_type: *t,
            hex: hex::encode(bytes),
        },
        P::ClassicalWithNonStandardVersionTypeBytesPayloadType(_) => return None,
    })
}
