/*
 * Copyright (c) 2015 Cryptonomex, Inc., and contributors.
 *
 * The MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import {
    SETTINGS_CLAIM_SET_KEY_ERROR,
    SETTINGS_CLAIM_SET_PRIVATE_KEY,
    SETTINGS_CLAIM_SET_BALANCES_DATA,
    SETTINGS_CLAIM_RESET,
    SETTINGS_CLAIM_RESET_BALANCES
} from '../constants/ActionTypes';
import {PrivateKey, key, FetchChain} from 'peerplaysjs-lib';
import {Apis} from "peerplaysjs-ws";
import Immutable from "immutable";
import KeysService from "../services/KeysService";
import TransactionService from "../services/TransactionService";
import Repository from '../repositories/chain/repository';
import BalanceRepository from '../repositories/BalanceRepository';
import counterpart from "counterpart";

/**
 * Private Action Creator (SETTINGS_CLAIM_SET_KEY_ERROR)
 *
 * @param data
 * @returns {{type: SETTINGS_CLAIM_SET_KEY_ERROR, payload: *}}
 */
function setKeyErrorAction(data) {
    return {
        type: SETTINGS_CLAIM_SET_KEY_ERROR,
        payload: data
    }
}

/**
 * Private Action Creator (SETTINGS_CLAIM_SET_PRIVATE_KEY)
 *
 * @param data
 * @returns {{type: SETTINGS_CLAIM_SET_PRIVATE_KEY, payload: *}}
 */

function setPrivateKeyAction(data) {
    return {
        type: SETTINGS_CLAIM_SET_PRIVATE_KEY,
        payload: data
    }
}

/**
 * Private Action Creator (SETTINGS_CLAIM_SET_BALANCES_DATA)
 *
 * @param data
 * @returns {{type: SETTINGS_CLAIM_SET_BALANCES_DATA, payload: *}}
 */
function setBalancesDataAction(data) {
    return {
        type: SETTINGS_CLAIM_SET_BALANCES_DATA,
        payload: data
    }
}

/**
 * Private Action Creator (SETTINGS_CLAIM_RESET)
 *
 * @param data
 * @returns {{type: SETTINGS_CLAIM_RESET, payload: *}}
 */
function resetBalancesDataAction(data) {
    return {
        type: SETTINGS_CLAIM_RESET,
        payload: data
    }
}

/**
 * Private Action Creator (SETTINGS_CLAIM_RESET_BALANCES)
 *
 * @param data
 * @returns {{type: SETTINGS_CLAIM_RESET_BALANCES, payload: *}}
 */
function resetBalancesAction(data) {
    return {
        type: SETTINGS_CLAIM_RESET_BALANCES,
        payload: data
    }
}

/**
 * Claim Sharedrop page
 */
class SettingsClaimActions {

    /**
     * This is started after pressing the button "Lookup Balances"
     *
     * @param {String} ownerKeyString
     * @returns {function(*=)}
     */
    static lookupBalances(ownerKeyString) {

        return (dispatch) => {

            dispatch(resetBalancesDataAction());

            //TODO::services

            try {

                let privateKey = PrivateKey.fromWif(ownerKeyString),
                    publicKey = privateKey.toPublicKey().toPublicKeyString(),
                    addresses = key.addresses(publicKey);

                BalanceRepository.getBalanceObjects(addresses).then( results => {

                    if (!results.length) {

                        dispatch(setKeyErrorAction({
                            claim_error: counterpart.translate("errors.no_balance_objects")
                        }));

                        return Promise.reject("No balance objects");
                    }

                    let balance_ids = [];

                    for(let balance of results) {
                        balance_ids.push(balance.id);
                    }

                    dispatch(setPrivateKeyAction({
                        claim_privateKey: ownerKeyString
                    }));

                    return BalanceRepository.getVestedBalances(balance_ids).then( vested_balances => {

                        let assetsPromises = [];

                        let assetsIdsHash = Object.create(null);

                        let balances = Immutable.List().withMutations( balance_list => {
                            for(let i = 0; i < results.length; i++) {

                                let balance = results[i];

                                if(balance.vesting_policy) {
                                    balance.vested_balance = vested_balances[i];
                                }

                                balance.available_balance = vested_balances[i];

                                balance.public_key_string = publicKey;

                                balance_list.push(Immutable.fromJS(balance));

                                if (!assetsIdsHash[balance.balance.asset_id]) {
                                    assetsIdsHash[balance.balance.asset_id] = true;
                                    assetsPromises.push(Repository.getAsset(balance.balance.asset_id));
                                }

                            }

                        });

                        return Promise.all([Promise.all(assetsPromises),balances])
                    });

                }).then(([assets, balances]) => {

                    let assetsHash = Object.create(null);

                    assets.forEach((asset) => {
                        assetsHash[asset.get('id')] = asset;
                    });

                    balances = balances.map((balance) => {
                        return balance.setIn(['balance', 'asset'], assetsHash[balance.getIn(['balance', 'asset_id'])]);
                    });

                    Repository.getAccountRefsOfKey(publicKey).then((resultKeys) => {

                        let ids = [];

                        resultKeys.forEach((rKey) => {
                            ids.push(rKey)
                        });

                        if (ids.length) {

                            let accountPromises = ids.map((id) => {
                                return Repository.getAccount(id);
                            });

                            Promise.all(accountPromises).then((accounts) => {

                                let accountsNames = [];

                                accounts.forEach((account) => {
                                    accountsNames.push(account.get('name'));
                                });

                                balances = balances.map((balance) => {
                                    return balance.setIn(['accounts'], accountsNames);
                                });

                                dispatch(setBalancesDataAction({
                                    claim_balances: balances
                                }));
                            });

                        } else {

                            dispatch(setBalancesDataAction({
                                claim_balances: balances
                            }));

                        }

                    });

                });

            } catch (e) {
				console.error(e);
                dispatch(setKeyErrorAction({
                    claim_error: counterpart.translate("errors.paste_your_redemption_key_here")//e.message
                }));
            }

        }

    }

    /**
     * This is started after pressing the button "Import Balances"
     *
     * @returns {function(*=, *)}
     */
    static importBalance() {

        return (dispatch, getState) => {

            return new Promise((resolve) => {

                let state = getState();

                let balances = state.pageSettings.claim_balances;
                let account_name_or_id = state.app.accountId;

                let account_lookup = FetchChain("getAccount", account_name_or_id);

                let p = Promise.all([ account_lookup ]).then( (results)=> {
                    let account = results[0];

                    if(!account) {
                        return Promise.reject("Unknown account " + account_name_or_id);
                    }

                    let balance_claims = [];

                    for(let balance of balances) {

                        balance = balance.toJS();
                        let {vested_balance, public_key_string} = balance;


                        let total_claimed;
                        if( vested_balance ) {
                            if(vested_balance.amount == 0)
                            // recently claimed
                                continue;

                            total_claimed = vested_balance.amount;
                        } else
                            total_claimed = balance.balance.amount;

                        //assert
                        if(vested_balance && vested_balance.asset_id != balance.balance.asset_id) {
                            throw new Error("Vested balance record and balance record asset_id missmatch",
                                vested_balance.asset_id,
                                balance.balance.asset_id
                            )
                        }

                        balance_claims.push({
                            fee: { amount: "0", asset_id: "1.3.0"},
                            deposit_to_account: account.get("id"),
                            balance_to_claim: balance.id,
                            balance_owner_key: public_key_string,
                            total_claimed: {
                                amount: total_claimed,
                                asset_id: balance.balance.asset_id
                            }
                        })
                    }

                    if( ! balance_claims.length) {
                        throw new Error("No balances to claim")
                    }

                    return new Promise((resolve) => {
                        KeysService.getActiveKeyFromState(state, dispatch).then(() => {

                            TransactionService.importBalances(balance_claims, account.get("id"), state.pageSettings.claim_privateKey, () => {

                                dispatch(resetBalancesDataAction());
                                resolve();

                            }).then((trFnc) => {
                                dispatch(trFnc);
                            });

                        });
                    });



                });
                resolve(p)
            })
        }
    }

    static resetKey() {
        return resetBalancesDataAction();
    }

    static resetBalances() {
        return resetBalancesAction();
    }
}

export default SettingsClaimActions;