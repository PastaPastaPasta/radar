Vectors copied or extracted from rust-dashcore (dashpay/rust-dashcore, rev 568d5866):

- `block_*.hex`, `evo_pro_up_serv_tx_v3.hex`, `pro_reg_tx_v3_*.hex`, `pro_up_reg_tx_v3.hex`: `dash/tests/data/core_v24_devnet/` (Dash Core v24 devnet, via DAPI).
- `testnet_block_*.raw`, `block_13b8a.hex`: `dash/tests/data/`.
- `assetlock_mainnet_core.hex`, `cbtx_mainnet_block_27facf.hex`, `proreg_testnet_v1.hex`: assembled from the constants in `dash/tests/legacy_asset_lock.rs` (asset lock with Core's 0x24 length prefix).
- `proupreg_testnet_v1.hex`: `provider_update_registrar.rs` unit test.
- `proreg_testnet_collateral_in_tx.hex`: `provider_registration.rs` unit test.
- `proupserv_testnet_v1.hex`: `provider_update_service.rs` unit test.

ProUpRevTx, MNHF and asset unlock have no full-transaction vector upstream; `tests/vectors.rs` builds them with rust-dashcore's own encoders from the values in its unit tests.
