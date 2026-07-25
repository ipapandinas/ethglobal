import "dotenv/config";
import {
  AccountId,
    PrivateKey,
    Client,
    Status,
    TokenAssociateTransaction
} from "@hashgraph/sdk";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`missing env: ${name} — set it in .env.local (or pass DOTENV_CONFIG_PATH)`);
    process.exit(1);
  }
  return value;
}

async function main() {
  let client;
  try {
    // Which account to associate: ACCT=A (broker, default) or ACCT=B (buyer).
    const acct = (process.env.ACCT ?? "A").toUpperCase();
    const MY_ACCOUNT_ID = AccountId.fromString(requireEnv(`ACCOUNT_${acct}_ID`));
    const MY_PRIVATE_KEY = PrivateKey.fromStringECDSA(requireEnv(`ACCOUNT_${acct}_KEY`));

    // Pre-configured client for testnet
    client = Client.forTestnet();

    //Set the operator with the account ID and private key
    client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

    // USDC on Hedera testnet (override with USDC_TOKEN_ID if needed)
    const tokenId = process.env.USDC_TOKEN_ID ?? '0.0.429274'
    console.log(`Associating token ${tokenId} with ${MY_ACCOUNT_ID.toString()}…`);

    //Associate a token to an account and freeze the unsigned transaction for signing
    const txTokenAssociate = await new TokenAssociateTransaction()
      .setAccountId(MY_ACCOUNT_ID)
      .setTokenIds([tokenId]) //Fill in the token ID
      .freezeWith(client);

    //Sign with the private key of the account that is being associated to a token 
    const signTxTokenAssociate = await txTokenAssociate.sign(MY_PRIVATE_KEY);

    //Submit the transaction to a Hedera network    
    const txTokenAssociateResponse = await signTxTokenAssociate.execute(client);

    //Request the receipt of the transaction
    const receiptTokenAssociateTx = await txTokenAssociateResponse.getReceipt(client);

    //Get the transaction consensus status
    const statusTokenAssociateTx = receiptTokenAssociateTx.status;

    //Get the Transaction ID
    const txTokenAssociateId = txTokenAssociateResponse.transactionId.toString();

    console.log("--------------------------------- Token Associate ---------------------------------");
    console.log("Receipt status           :", statusTokenAssociateTx.toString());
    console.log("Transaction ID           :", txTokenAssociateId);
    console.log("Hashscan URL             :", "https://hashscan.io/testnet/transaction/" + txTokenAssociateId);
      
  } catch (error) {
    // Re-running after a successful association is fine — treat it as a no-op.
    if (error instanceof Error && error.message.includes(Status.TokenAlreadyAssociatedToAccount.toString())) {
      console.log("Already associated — nothing to do. You can claim USDC from the faucet.");
      return;
    }
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (client) client.close();
  }
}

main();
