import fs from "fs";
import axios from "axios";
import { ethers } from "ethers";

const responseLogFile = "respon.txt";

// Konfigurasi jaringan Nexus
const RPC_URL = "https://rpc.nexus.xyz/http";
const CHAIN_ID = 392;
const API_BASE_URL = "https://app.dynamicauth.com/api/v0/sdk/adc09cea-6194-4667-8be8-931cc28dacd2";

// Membaca private keys dari data.txt
const privateKeys = fs.readFileSync("data.txt", "utf-8").trim().split("\n");

async function logResponse(endpoint, data) {
    const logEntry = `Endpoint: ${endpoint}\nResponse: ${JSON.stringify(data, null, 2)}\n\n`;
    fs.appendFileSync(responseLogFile, logEntry);
}

async function connectWallet(privateKey) {
    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(privateKey, provider);
        console.log(`🔗 Wallet ${wallet.address} terhubung ke Nexus.`);
        return wallet;
    } catch (error) {
        console.error("❌ Gagal menghubungkan wallet:", error);
    }
}

async function processWallet(pk, index) {
    console.log(`\n🚀 Memproses Wallet ke-${index + 1}`);
    const wallet = await connectWallet(pk);
    if (!wallet) return;
}

async function main() {
    for (let i = 0; i < privateKeys.length; i++) {
        await processWallet(privateKeys[i], i);
    }
}

main();
