import fs from 'fs';
import Web3 from 'web3';
import axios from 'axios';

const RPC_URL = 'https://rpc.nexus.xyz/http';
const CHAIN_ID = 392;
const API_BASE = 'https://app.dynamicauth.com/api/v0/sdk/adc09cea-6194-4667-8be8-931cc28dacd2';

// Baca private key dari file data.txt
function loadPrivateKeys(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf-8')
            .split('\n')
            .map(pk => pk.trim())
            .filter(pk => pk);
    } catch (error) {
        console.error('Gagal membaca file data.txt:', error);
        return [];
    }
}

// Inisialisasi koneksi Web3
function initializeWeb3(rpcUrl) {
    return new Web3(new Web3.providers.HttpProvider(rpcUrl));
}

// Helper untuk menunggu
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Menghubungkan wallet
async function connectWalletAPI(address) {
    try {
        const response = await axios.post(`${API_BASE}/connect`, {
            address,
            chain: 'EVM',
            provider: 'browserExtension',
            walletName: 'metamask',
            authMode: 'connect-and-sign'
        }, {
            headers: { 'content-type': 'application/json', 'origin': 'https://app.nexus.xyz' }
        });
        console.log('Response dari endpoint /connect:', response.data);
        return response.data;
    } catch (error) {
        console.error('Gagal menghubungkan wallet:', error);
    }
}

// Dapatkan pesan nonce untuk autentikasi
async function getNonce() {
    try {
        const response = await axios.get(`${API_BASE}/nonce`, {
            headers: { 'origin': 'https://app.nexus.xyz', 'accept': '*/*' }
        });
        console.log('Response dari endpoint /nonce:', response.data);
        return response.data.nonce;
    } catch (error) {
        console.error('Gagal mendapatkan nonce:', error);
        return null;
    }
}

// Fungsi utama untuk menghubungkan wallet
async function connectWallet(privateKey, web3) {
    const account = web3.eth.accounts.privateKeyToAccount('0x' + privateKey);
    console.log(`Terhubung dengan wallet: ${account.address}`);

    await connectWalletAPI(account.address);
    const nonce = await getNonce();
    if (!nonce) return;

    console.log('Menunggu 1 menit sebelum lanjut...');
    await delay(60000); // Jeda 1 menit
}

async function main() {
    const privateKeys = loadPrivateKeys('data.txt');
    if (privateKeys.length === 0) {
        console.error('Tidak ada private key yang ditemukan.');
        return;
    }

    const web3 = initializeWeb3(RPC_URL);
    for (const privateKey of privateKeys) {
        await connectWallet(privateKey, web3);
    }
}

main();
