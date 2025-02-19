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

async function signAndAuthenticate(wallet) {
    try {
        const nonceResponse = await axios.get(`${API_BASE_URL}/nonce`);
        logResponse("/nonce", nonceResponse.data);
        
        if (!nonceResponse.data || !nonceResponse.data.nonce) {
            throw new Error("Response dari /nonce tidak valid.");
        }

        const nonce = nonceResponse.data.nonce;
        const messageToSign = `app.nexus.xyz wants you to sign in with your Ethereum account:\n${wallet.address}\n\nNonce: ${nonce}`;
        
        const signedMessage = await wallet.signMessage(messageToSign);

        const verifyResponse = await axios.post(`${API_BASE_URL}/verify`, {
            signedMessage,
            messageToSign,
            publicWalletAddress: wallet.address,
            chain: "EVM",
            walletName: "metamask",
            walletProvider: "browserExtension",
            network: CHAIN_ID.toString(),
        });
        logResponse("/verify", verifyResponse.data);
        
        if (!verifyResponse.data || !verifyResponse.data.jwt) {
            throw new Error("Verifikasi gagal, JWT tidak ditemukan dalam respons.");
        }

        return verifyResponse.data.jwt;
    } catch (error) {
        console.error("❌ Gagal autentikasi:", error.response ? error.response.data : error.message);
    }
}

async function processWallet(pk, index) {
    console.log(`\n🚀 Memproses Wallet ke-${index + 1}`);
    const wallet = await connectWallet(pk);
    if (!wallet) return;

    const jwt = await signAndAuthenticate(wallet);
    if (!jwt) return;

    console.log(`🔄 [Wallet ${index + 1}] Memilih wallet...`);
    const selectionResponse = await axios.put(`${API_BASE_URL}/users/wallets/selection`, {
        walletId: wallet.address
    }, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    logResponse("/users/wallets/selection", selectionResponse.data);
    console.log(`✅ [Wallet ${index + 1}] Wallet berhasil dipilih.`);

    console.log(`🔄 [Wallet ${index + 1}] Memperbarui data pengguna...`);
    const updateUserResponse = await axios.put(`${API_BASE_URL}/users`, { email: "", metadata: { "Get Updates": "" } }, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    logResponse("/users", updateUserResponse.data);
    console.log(`✅ [Wallet ${index + 1}] Data pengguna diperbarui.`);
}

async function main() {
    for (let i = 0; i < privateKeys.length; i++) {
        await processWallet(privateKeys[i], i);
    }
}

main();
