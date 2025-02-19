import fs from "fs";
import axios from "axios";
import { ethers } from "ethers";

// Konfigurasi jaringan Nexus
const RPC_URL = "https://rpc.nexus.xyz/http";
const CHAIN_ID = 392;
const API_BASE_URL = "https://app.dynamicauth.com/api/v0/sdk/adc09cea-6194-4667-8be8-931cc28dacd2";

// Membaca private keys dari data.txt
const privateKeys = fs.readFileSync("data.txt", "utf-8").trim().split("\n");

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function processWallet(pk, index) {
    console.log(`\n🚀 Memproses Wallet ke-${index + 1}`);
    const wallet = await connectWallet(pk);
    if (!wallet) return;

    const jwt = await signAndAuthenticate(wallet);
    if (!jwt) return;

    await delay(2000);
    console.log(`🔄 [Wallet ${index + 1}] Memilih wallet...`);
    await axios.put(`${API_BASE_URL}/users/wallets/selection`, {
        walletId: wallet.address
    }, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    console.log(`✅ [Wallet ${index + 1}] Wallet berhasil dipilih.`);

    await delay(2000);
    console.log(`🔄 [Wallet ${index + 1}] Memperbarui data pengguna...`);
    await axios.put(`${API_BASE_URL}/users`, { email: "", metadata: { "Get Updates": "" } }, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    console.log(`✅ [Wallet ${index + 1}] Data pengguna diperbarui.`);

    await fetchBlockchainData(jwt, index);
}

async function fetchBlockchainData(jwt, index) {
    try {
        await delay(2000);
        console.log(`📡 [Wallet ${index + 1}] Mengambil nomor blok terbaru...`);
        const blockNumberResponse = await axios.post(`${RPC_URL}`, {
            jsonrpc: "2.0",
            method: "eth_blockNumber",
            params: [],
            id: 1
        });
        const blockNumber = blockNumberResponse.data.result;
        console.log(`🔢 [Wallet ${index + 1}] Nomor blok terbaru: ${blockNumber}`);

        await delay(2000);
        console.log(`📡 [Wallet ${index + 1}] Mengambil detail blok...`);
        const blockDetailsResponse = await axios.post(`${RPC_URL}`, {
            jsonrpc: "2.0",
            method: "eth_getBlockByNumber",
            params: [blockNumber, false],
            id: 2
        });
        console.log(`📦 [Wallet ${index + 1}] Detail blok:`, blockDetailsResponse.data.result);
    } catch (error) {
        console.error(`❌ [Wallet ${index + 1}] Gagal mengambil data blockchain:`, error.response ? error.response.data : error.message);
    }
}

async function main() {
    for (let i = 0; i < privateKeys.length; i++) {
        await processWallet(privateKeys[i], i);
    }
}

main();
