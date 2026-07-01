// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
type TransactionObjectArgument = any;
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { bcs } from "@mysten/sui/bcs";

/**
 * Identifies a binary position (UP/DOWN) by oracle, expiry, and strike price.
 */
export interface MarketKey {
  oracleId: string;
  expiry: number | bigint;
  strike: number | bigint;
  isUp: boolean;
}

/**
 * Client for interacting with the DeepBook Predict protocol.
 * Handles transaction construction and data fetching from predict-server.
 */
export class PredictClient {
  public client: SuiJsonRpcClient;
  public packageId: string;
  public predictId: string;
  public serverUrl?: string;

  constructor(
    client: SuiJsonRpcClient,
    packageId: string,
    predictId: string,
    serverUrl?: string,
  ) {
    this.client = client;
    this.packageId = packageId;
    this.predictId = predictId;
    this.serverUrl = serverUrl;
  }

  /**
   * Fetch all active oracles from predict-server.
   */
  async getOracles(): Promise<any[]> {
    if (!this.serverUrl) throw new Error("Server URL not configured");
    const response = await fetch(`${this.serverUrl}/api/v1/oracles`);
    return response.json();
  }

  /**
   * Fetch all vaults from predict-server.
   */
  async getVaults(): Promise<any[]> {
    if (!this.serverUrl) throw new Error("Server URL not configured");
    const response = await fetch(`${this.serverUrl}/api/v1/vaults`);
    return response.json();
  }

  /**
   * Fetch user positions for a given manager from predict-server.
   */
  async getUserPositions(managerId: string): Promise<any[]> {
    if (!this.serverUrl) throw new Error("Server URL not configured");
    const response = await fetch(`${this.serverUrl}/api/v1/positions/${managerId}`);
    return response.json();
  }

  /**
   * Fetch mint events for a given trader.
   */
  async getMintEvents(trader?: string): Promise<any[]> {
    if (!this.serverUrl) throw new Error("Server URL not configured");
    const url = new URL(`${this.serverUrl}/api/v1/events/minted`);
    if (trader) url.searchParams.append("trader", trader);
    const response = await fetch(url.toString());
    return response.json();
  }

  /**
   * Fetch redeem events for a given owner.
   */
  async getRedeemEvents(owner?: string): Promise<any[]> {
    if (!this.serverUrl) throw new Error("Server URL not configured");
    const url = new URL(`${this.serverUrl}/api/v1/events/redeemed`);
    if (owner) url.searchParams.append("owner", owner);
    const response = await fetch(url.toString());
    return response.json();
  }

  /**
   * Mint a binary position (UP or DOWN) using an enabled quote asset.
   * The user pays the fair price plus per-unit fee up front.
   */
  mint(
    tx: Transaction,
    params: {
      managerId: string | TransactionObjectArgument;
      oracleId: string | { objectId: string, version: string | number, digest: string } | TransactionObjectArgument;
      marketKey: MarketKey;
      quantity: number | bigint;
      quoteAsset: string;
    },
  ) {
    const { managerId, oracleId, marketKey, quantity, quoteAsset } = params;

    // Correctly resolve oracleId for pure arguments
    const oracleIdStr = typeof oracleId === 'string' 
      ? oracleId 
      : (oracleId as any).objectId;

    const oracleInput = tx.object(oracleIdStr);

    const key = tx.moveCall({
      target: `${this.packageId}::market_key::new`,
      arguments: [
        tx.pure.address(oracleIdStr),
        tx.pure.u64(marketKey.expiry.toString()),
        tx.pure.u64(marketKey.strike.toString()),
        tx.pure.bool(!!marketKey.isUp),
      ],
    });

    tx.moveCall({
      target: `${this.packageId}::predict::mint`,
      typeArguments: [quoteAsset],
      arguments: [
        tx.object(this.predictId),
        tx.object(managerId),
        oracleInput,
        key,
        tx.pure.u64(quantity.toString()),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
  }

  /**
   * Redeem a binary position.
   * Live payout is post-trade fair value less fee.
   * Settlement redemption is zero-fee and pays if settlement landed in the predicted direction.
   */
  redeem(
    tx: Transaction,
    params: {
      managerId: string;
      oracleId: string;
      marketKey: MarketKey;
      quantity: number | bigint;
      quoteAsset: string;
    },
  ) {
    const { managerId, oracleId, marketKey, quantity, quoteAsset } = params;

    const key = tx.moveCall({
      target: `${this.packageId}::market_key::new`,
      arguments: [
        tx.pure.address(marketKey.oracleId),
        tx.pure.u64(marketKey.expiry.toString()),
        tx.pure.u64(marketKey.strike.toString()),
        tx.pure.bool(!!marketKey.isUp),
      ],
    });

    tx.moveCall({
      target: `${this.packageId}::predict::redeem`,
      typeArguments: [quoteAsset],
      arguments: [
        tx.object(this.predictId),
        tx.object(managerId),
        tx.object(oracleId),
        key,
        tx.pure.u64(quantity.toString()),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
  }

  /**
   * Mint a pair of UP and DOWN positions using 1.0 quote asset as collateral.
   * No fees are charged as the vault exposure remains neutral.
   */
  mintCollateralized(
    tx: Transaction,
    params: {
      managerId: string;
      oracleId: string;
      upKey: MarketKey;
      downKey: MarketKey;
      quantity: number | bigint;
      quoteAsset: string;
    },
  ) {
    const { managerId, oracleId, upKey, downKey, quantity, quoteAsset } = params;

    const up = tx.moveCall({
      target: `${this.packageId}::market_key::new`,
      arguments: [
        tx.pure.id(upKey.oracleId),
        tx.pure.u64(upKey.expiry.toString()),
        tx.pure.u64(upKey.strike.toString()),
        tx.pure.bool(true),
      ],
    });

    const down = tx.moveCall({
      target: `${this.packageId}::market_key::new`,
      arguments: [
        tx.pure.id(downKey.oracleId),
        tx.pure.u64(downKey.expiry.toString()),
        tx.pure.u64(downKey.strike.toString()),
        tx.pure.bool(false),
      ],
    });

    tx.moveCall({
      target: `${this.packageId}::predict::mint_collateralized`,
      typeArguments: [quoteAsset],
      arguments: [
        tx.object(this.predictId),
        tx.object(managerId),
        tx.object(oracleId),
        up,
        down,
        tx.pure.u64(quantity.toString()),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
  }

  /**
   * Redeem a paired collateral lock for 1.0 quote asset.
   */
  redeemCollateralized(
    tx: Transaction,
    params: {
      managerId: string;
      oracleId: string;
      upKey: MarketKey;
      downKey: MarketKey;
      quantity: number | bigint;
      quoteAsset: string;
    },
  ) {
    const { managerId, oracleId, upKey, downKey, quantity, quoteAsset } = params;

    const up = tx.moveCall({
      target: `${this.packageId}::market_key::new`,
      arguments: [
        tx.pure.id(upKey.oracleId),
        tx.pure.u64(upKey.expiry.toString()),
        tx.pure.u64(upKey.strike.toString()),
        tx.pure.bool(true),
      ],
    });

    const down = tx.moveCall({
      target: `${this.packageId}::market_key::new`,
      arguments: [
        tx.pure.id(downKey.oracleId),
        tx.pure.u64(downKey.expiry.toString()),
        tx.pure.u64(downKey.strike.toString()),
        tx.pure.bool(false),
      ],
    });

    tx.moveCall({
      target: `${this.packageId}::predict::redeem_collateralized`,
      typeArguments: [quoteAsset],
      arguments: [
        tx.object(this.predictId),
        tx.object(managerId),
        tx.object(oracleId),
        up,
        down,
        tx.pure.u64(quantity.toString()),
        tx.object("0x0000000000000000000000000000000000000000000000000000000000000006"),
      ],
    });
  }

  /**
   * Supply an enabled quote asset into the shared LP pool.
   * Returns the LP (PLP) coin.
   */
  supply(
    tx: Transaction,
    params: {
      coin: TransactionObjectArgument;
      quoteAsset: string;
    },
  ) {
    const { coin, quoteAsset } = params;

    return tx.moveCall({
      target: `${this.packageId}::predict::supply`,
      typeArguments: [quoteAsset],
      arguments: [
        tx.object(this.predictId),
        tx.object(coin),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
  }

  /**
   * Withdraw a selected quote asset from the vault by providing LP tokens.
   */
  withdraw(
    tx: Transaction,
    params: {
      lpCoin: TransactionObjectArgument;
      quoteAsset: string;
    },
  ) {
    const { lpCoin, quoteAsset } = params;

    return tx.moveCall({
      target: `${this.packageId}::predict::withdraw`,
      typeArguments: [quoteAsset],
      arguments: [
        tx.object(this.predictId),
        tx.object(lpCoin),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
  }

  /**
   * Helper to create a new PredictManager.
   */
  createManager(tx: Transaction, registryId: string) {
    return tx.moveCall({
      target: `${this.packageId}::registry::create_manager`,
      arguments: [tx.object(registryId)],
    });
  }

  /**
   * Helper to deposit funds into PredictManager.
   */
  depositToManager(
    tx: Transaction,
    params: {
      managerId: string;
      coin: TransactionObjectArgument;
      quoteAsset: string;
    },
  ) {
    const { managerId, coin, quoteAsset } = params;

    tx.moveCall({
      target: `${this.packageId}::predict_manager::deposit`,
      typeArguments: [quoteAsset],
      arguments: [tx.object(managerId), tx.object(coin)],
    });
  }

  /**
   * Withdraw funds from PredictManager to wallet.
   */
  withdrawFromManager(
    tx: Transaction,
    params: {
      managerId: string;
      amount: bigint;
      quoteAsset: string;
    },
  ) {
    const { managerId, amount, quoteAsset } = params;

    return tx.moveCall({
      target: `${this.packageId}::predict_manager::withdraw`,
      typeArguments: [quoteAsset],
      arguments: [tx.object(managerId), tx.pure.u64(amount.toString())],
    });
  }
}
