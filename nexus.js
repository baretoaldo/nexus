import fs from "fs";
import axios from "axios";
import { ethers } from "ethers";

// Konfigurasi jaringan Nexus
const RPC_URL = "https://rpc.nexus.xyz/http";
const CHAIN_ID = 392;
const API_BASE_URL = "https://app.dynamicauth.com/api/v0/sdk/adc09cea-6194-4667-8be8-931cc28dacd2";

// Membaca private keys dari data.txt
const privateKeys = fs.readFileSync("data.txt", "utf-8").trim().split("\n");

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
        // Mendapatkan nonce untuk autentikasi
        const nonceResponse = await axios.get(`${API_BASE_URL}/nonce`);
        console.log("🔍 Response dari /nonce:", nonceResponse.data);
        
        if (!nonceResponse.data || !nonceResponse.data.nonce) {
            throw new Error("Response dari /nonce tidak valid.");
        }

        const nonce = nonceResponse.data.nonce;
        const messageToSign = `app.nexus.xyz wants you to sign in with your Ethereum account:\n${wallet.address}\n\nNonce: ${nonce}`;
        console.log("📜 Pesan untuk ditandatangani:", messageToSign);

        // Menandatangani pesan
        const signedMessage = await wallet.signMessage(messageToSign);
        console.log("✍️ Tanda tangan berhasil:", signedMessage);

        // Verifikasi autentikasi
        const verifyResponse = await axios.post(`${API_BASE_URL}/verify`, {
            signedMessage,
            messageToSign,
            publicWalletAddress: wallet.address,
            chain: "EVM",
            walletName: "metamask",
            walletProvider: "browserExtension",
            network: CHAIN_ID.toString(),
        });
        
        if (!verifyResponse.data || !verifyResponse.data.jwt) {
            throw new Error("Verifikasi gagal, JWT tidak ditemukan dalam respons.");
        }

        const jwt = verifyResponse.data.jwt;
        console.log("✅ Autentikasi sukses, JWT:", jwt);
        return jwt;
    } catch (error) {
        console.error("❌ Gagal autentikasi:", error.response ? error.response.data : error.message);
    }
}

async function main() {
    for (const pk of privateKeys) {
        console.log("\n🚀 Memulai koneksi untuk private key");
        const wallet = await connectWallet(pk);
        if (!wallet) continue;

        const jwt = await signAndAuthenticate(wallet);
        if (!jwt) continue;

        // Menggunakan JWT untuk mengupdate user data
        await axios.put(`${API_BASE_URL}/users`, { email: "", metadata: { "Get Updates": "" } }, {
            headers: { Authorization: `Bearer ${jwt}` },
        });
        console.log("🔄 Data pengguna diperbarui.");
    }
}

main();
