use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockOut {
    pub hash: String,
    pub version: i32,
    pub prev_block_hash: String,
    pub merkle_root: String,
    pub time: u32,
    pub bits: u32,
    pub nonce: u32,
    pub size: usize,
    pub tx_count: usize,
    pub coinbase: Option<CoinbaseOut>,
    pub txs: Vec<TxJson>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CoinbaseOut {
    pub script_sig_hex: String,
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TxJson {
    pub txid: String,
    pub version: u16,
    pub tx_type: u16,
    pub tx_type_name: &'static str,
    pub lock_time: u32,
    pub size: usize,
    pub is_coinbase: bool,
    pub coinbase: Option<CoinbaseOut>,
    pub inputs: Vec<InputOut>,
    pub outputs: Vec<OutputOut>,
    pub payload: Option<PayloadOut>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputOut {
    pub prev_txid: String,
    pub vout: u32,
    pub script_sig_hex: String,
    pub script_sig_asm: String,
    pub sequence: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputOut {
    pub n: usize,
    pub value: u64,
    pub script_pub_key_hex: String,
    pub script_pub_key_asm: String,
    pub script_type: &'static str,
    pub address: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutPointOut {
    pub txid: String,
    pub vout: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptOut {
    pub hex: String,
    pub script_type: &'static str,
    pub address: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PayoutShareOut {
    pub script: ScriptOut,
    pub reward: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyHashOut {
    pub hash: String,
    pub address: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetInfoEntryOut {
    pub kind: &'static str,
    pub network: Option<&'static str>,
    pub address: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetInfoPurposeOut {
    pub purpose: &'static str,
    pub entries: Vec<NetInfoEntryOut>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetInfoOut {
    pub version: u8,
    pub purposes: Vec<NetInfoPurposeOut>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceOut {
    pub address: Option<String>,
    pub net_info: Option<NetInfoOut>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollateralShareOut {
    pub amount: i64,
    pub script_refund: ScriptOut,
    pub script_reward: ScriptOut,
    pub owner_key: KeyHashOut,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedCollateralOut {
    pub shares: Vec<CollateralShareOut>,
    pub join_sigs: Vec<String>,
    pub early_period_blocks: u32,
    pub early_penalty: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuorumEntryOut {
    pub version: u16,
    pub llmq_type: u8,
    pub llmq_type_name: String,
    pub quorum_hash: String,
    pub quorum_index: Option<i16>,
    pub signers_count: usize,
    pub valid_members_count: usize,
    pub signers: String,
    pub valid_members: String,
    pub quorum_public_key: String,
    pub quorum_vvec_hash: String,
    pub threshold_sig: String,
    pub all_commitment_aggregated_signature: String,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PayloadOut {
    #[serde(rename_all = "camelCase")]
    ProRegTx {
        version: u16,
        masternode_type: u16,
        masternode_mode: u16,
        collateral_outpoint: OutPointOut,
        collateral_in_tx: bool,
        service: ServiceOut,
        owner_key: KeyHashOut,
        operator_public_key: String,
        voting_key: KeyHashOut,
        operator_reward: u16,
        script_payout: Option<ScriptOut>,
        payouts: Option<Vec<PayoutShareOut>>,
        shared_collateral: Option<SharedCollateralOut>,
        inputs_hash: String,
        platform_node_id: Option<String>,
        platform_p2p_port: Option<u16>,
        platform_http_port: Option<u16>,
        signature: String,
    },
    #[serde(rename_all = "camelCase")]
    ProUpServTx {
        version: u16,
        mn_type: Option<u16>,
        pro_tx_hash: String,
        service: ServiceOut,
        script_operator_payout: Option<ScriptOut>,
        inputs_hash: String,
        platform_node_id: Option<String>,
        platform_p2p_port: Option<u16>,
        platform_http_port: Option<u16>,
        payload_sig: String,
    },
    #[serde(rename_all = "camelCase")]
    ProUpRegTx {
        version: u16,
        pro_tx_hash: String,
        provider_mode: u16,
        operator_public_key: String,
        voting_key: KeyHashOut,
        script_payout: Option<ScriptOut>,
        payouts: Option<Vec<PayoutShareOut>>,
        inputs_hash: String,
        payload_sig: String,
    },
    #[serde(rename_all = "camelCase")]
    ProUpRevTx {
        version: u16,
        pro_tx_hash: String,
        reason: u16,
        inputs_hash: String,
        payload_sig: String,
    },
    #[serde(rename_all = "camelCase")]
    CbTx {
        version: u16,
        height: u32,
        merkle_root_mn_list: String,
        merkle_root_quorums: Option<String>,
        best_cl_height_diff: Option<u32>,
        best_cl_height: Option<u32>,
        best_cl_signature: Option<String>,
        credit_pool_balance: Option<u64>,
        merkle_root_asset_unlocks: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    QcTx {
        version: u16,
        height: u32,
        commitment: QuorumEntryOut,
    },
    #[serde(rename_all = "camelCase")]
    MnhfTx {
        version: u8,
        version_bit: u8,
        quorum_hash: String,
        sig: String,
    },
    #[serde(rename_all = "camelCase")]
    AssetLockTx {
        version: u8,
        credit_outputs: Vec<OutputOut>,
        total_credit: u64,
    },
    #[serde(rename_all = "camelCase")]
    AssetUnlockTx {
        version: u8,
        index: u64,
        fee: u32,
        request_height: u32,
        quorum_hash: String,
        quorum_sig: String,
    },
    #[serde(rename_all = "camelCase")]
    ProDissolveTx {
        version: u16,
        pro_tx_hash: String,
        actor_index: u16,
        signatures: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    ProUpShareTx {
        version: u16,
        pro_tx_hash: String,
        share_index: u16,
        script_reward: Option<ScriptOut>,
        inputs_hash: String,
        payload_sig: String,
    },
    #[serde(rename_all = "camelCase")]
    ProUpSharedRegTx {
        version: u16,
        pro_tx_hash: String,
        operator_public_key: String,
        voting_key: KeyHashOut,
        inputs_hash: String,
        signatures: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    Raw {
        tx_type: u16,
        hex: String,
    },
}
