import 'dotenv/config';
import mongoose from 'mongoose';

async function check() {
  const uri = "mongodb+srv://phuclpst09495_db_user:usvWGk8MtpTRmsU8@cluster0.wqnww8c.mongodb.net/sui-portfolio?appName=Cluster0";
  const conn = await mongoose.createConnection(uri).asPromise();
  const Wallet = conn.model('Wallet', new mongoose.Schema({}, { strict: false }));
  const wallets = await Wallet.find().limit(5);
  console.log('Recent Wallets:', JSON.stringify(wallets, null, 2));
  
  const CoinBalance = conn.model('CoinBalance', new mongoose.Schema({}, { strict: false }));
  const balances = await CoinBalance.find().limit(5);
  console.log('Recent Balances:', JSON.stringify(balances, null, 2));
  
  await conn.close();
}

check().catch(console.error);
