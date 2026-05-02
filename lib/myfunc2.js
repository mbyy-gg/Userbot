require("./myfunc.js");
const config = require("../config.js");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const axios = require("axios");

async function createPanel(username, ramKey) {
  const email = `${username}@gmail.com`;
  const name = `${global.capital ? global.capital(username) : username} Server`;
  const password = `${username}001`;

  const resourceMap = {
    "1gb": { ram: "1000", disk: "1000", cpu: "40" },
    "2gb": { ram: "2000", disk: "1000", cpu: "60" },
    "3gb": { ram: "3000", disk: "2000", cpu: "80" },
    "4gb": { ram: "4000", disk: "2000", cpu: "100" },
    "5gb": { ram: "5000", disk: "3000", cpu: "120" },
    "6gb": { ram: "6000", disk: "3000", cpu: "140" },
    "7gb": { ram: "7000", disk: "4000", cpu: "160" },
    "8gb": { ram: "8000", disk: "4000", cpu: "180" },
    "9gb": { ram: "9000", disk: "5000", cpu: "200" },
    "10gb": { ram: "10000", disk: "5000", cpu: "220" },
    "unlimited": { ram: "0", disk: "0", cpu: "0" },
    "unli": { ram: "0", disk: "0", cpu: "0" }
  };

  const { ram, disk, cpu } = resourceMap[ramKey] || resourceMap["unli"];

  try {
    // ===== CREATE USER =====
    const f = await fetch(`${config.domain}/api/application/users`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apikey}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: name,
        last_name: "Server",
        language: "en",
        password
      })
    });

    const data = await f.json();
    if (data.errors) {
      return { success: false, message: data.errors[0]?.detail || "Create user failed" };
    }

    const user = data.attributes;

    // ===== GET EGG =====
    const f1 = await fetch(
      `${config.domain}/api/application/nests/${config.nestid}/eggs/${config.egg}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apikey}`
        }
      }
    );

    const data2 = await f1.json();
    const startup_cmd = data2.attributes?.startup || "npm start";

    // ===== CREATE SERVER =====
    const f2 = await fetch(`${config.domain}/api/application/servers`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apikey}`
      },
      body: JSON.stringify({
        name,
        description: global.tanggal
          ? global.tanggal(Date.now())
          : new Date().toLocaleString(),
        user: user.id,
        egg: parseInt(config.egg),
        docker_image: "ghcr.io/parkervcp/yolks:nodejs_20",
        startup: startup_cmd,
        environment: {
          INST: "npm",
          USER_UPLOAD: "0",
          AUTO_UPDATE: "0",
          CMD_RUN: "npm start"
        },
        limits: { memory: ram, swap: 0, disk, io: 500, cpu },
        feature_limits: { databases: 5, backups: 5, allocations: 5 },
        deploy: {
          locations: [parseInt(config.loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const result = await f2.json();
    if (result.errors) {
      return { success: false, message: result.errors[0]?.detail || "Create server failed" };
    }

    const server = result.attributes;
    const domainClean = (config.domain || "").replace(/https?:\/\//g, "");

    return {
      success: true,
      data: {
        username,
        email,
        password,
        serverId: server.id,
        serverName: server.name,
        panelUrl: `https://${domainClean}`
      }
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function createAdmin(username) {
  const uname = username.toLowerCase();
  const email = `${uname}@gmail.com`;
  const name = global.capital ? global.capital(uname) : uname;
  const password = `${uname}001`;

  const res = await fetch(`${config.domain}/api/application/users`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apikey}`,
    },
    body: JSON.stringify({
      email,
      username: uname,
      first_name: name,
      last_name: "Admin",
      root_admin: true,
      language: "en",
      password,
    }),
  });

  const data = await res.json();
  if (data.errors) {
    return { success: false, message: err.message };
  }

  const user = data.attributes;
  const domainClean = (config.domain || "").replace(/https?:\/\//g, "");

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    password,
    panel: `https://${domainClean}`,
    raw: user,
  };
}

function randomOrderId(prefix = "ORD") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/**
 * Create payment (OrderKuota / Pakasir)
 * Return: { type, amount, qris, orderId? }
 */
async function createPayment(type, amount, config) {
  // ===== ORDERKUOTA =====
  if (type === "orderkuota") {
    const url = `https://skyzopedia-api.vercel.app/orderkuota/createpayment?apikey=skyy&amount=${amount}&username=${config.orderkuota.username}&token=${config.orderkuota.token}`;
    const { data } = await axios.get(url);

    const qris = data?.result?.imageqris?.url;
    if (!qris) throw new Error("Gagal membuat QRIS OrderKuota");

    return {
      type,
      amount,
      qris,
      raw: data
    };
  }

  // ===== PAKASIR =====
  if (type === "pakasir") {
    const { slug, apiKey } = config.pakasir;
    const orderId = randomOrderId();

    const url = "https://app.pakasir.com/api/transactioncreate/qris";
    const body = {
      project: slug,
      order_id: orderId,
      amount,
      api_key: apiKey
    };

    const res = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" }
    });

    const payment = res.data?.payment;
    if (!payment?.payment_number)
      throw new Error("QR Pakasir tidak ditemukan");

    const qrString = payment.payment_number;

    // 👉 Generate QR image otomatis
    const qrDir = path.join(__dirname, "temp_qr");
    if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });

    const filePath = path.join(qrDir, `${orderId}.png`);
    await QRCode.toFile(filePath, qrString, {
      type: "png",
      width: 500,
      margin: 2
    });
    
    setTimeout(async() => {
    try {
    await fs.unlinkSync(filePath)
    } catch {}
    }, 60000)

    return {
      type,
      amount,
      orderId,
      qris: filePath, // 👉 path file PNG, bisa langsung replyWithPhoto
      expiredAt: payment.expired_at,
      raw: res.data
    };
  }

  throw new Error("Type payment tidak dikenal");
}

/**
 * Check payment status
 */
async function cekPaid(type, data, config, extra = {}) {
  // ===== ORDERKUOTA =====
  if (type === "orderkuota") {
    const cekUrl = `https://skyzopedia-api.vercel.app/orderkuota/mutasiqr?apikey=skyy&username=${config.orderkuota.username}&token=${config.orderkuota.token}`;
    const { data: res } = await axios.get(cekUrl);

    const list = res?.result || [];
    const { userId, orders, toRupiah } = extra;

    const found = list
      .filter(i => i.status === "IN")
      .find(i => toRupiah(i.kredit) === toRupiah(orders[userId]?.amount));

    return Boolean(found);
  }

  // ===== PAKASIR =====
  if (type === "pakasir") {
    const { slug, apiKey } = config.pakasir;

    const cekUrl = "https://app.pakasir.com/api/transactiondetail";
    const params = {
      project: slug,
      order_id: data.orderId,
      amount: data.amount,
      api_key: apiKey
    };

    const res = await axios.get(cekUrl, { params });

    const status =
      res.data?.transaction?.status ||
      res.data?.payment?.status ||
      res.data?.status ||
      "";

    return ["paid", "success", "completed"].includes(
      String(status).toLowerCase()
    );
  }

  throw new Error("Type payment tidak dikenal");
}


// ===== VPS SPECS =====
const vpsSpecs = {
    r2c2: { size: "s-2vcpu-2gb", name: "2GB RAM • 2 CPU Cores", icon: "✅" },
    r4c2: { size: "s-2vcpu-4gb", name: "4GB RAM • 2 CPU Cores", icon: "✅" },
    r8c4: { size: "s-4vcpu-8gb", name: "8GB RAM • 4 CPU Cores", icon: "✅" },
    r16c4: { size: "s-4vcpu-16gb-amd", name: "16GB RAM • 4 CPU Cores", icon: "✅" },
    r16c8: { size: "s-8vcpu-16gb-amd", name: "16GB RAM • 8 CPU Cores", icon: "✅" },
    r32c8: { size: "s-8vcpu-32gb-amd", name: "32GB RAM • 8 CPU Cores", icon: "✅" }
};

const vpsRegions = {
    sgp1: {
        name: "Singapore",
        flag: "🇸🇬",
        latency: "Tercepat untuk Asia",
        available: true
    },
    nyc1: {
        name: "New York",
        flag: "🇺🇸",
        latency: "USA Pantai Timur",
        available: true
    },
    sfo3: {
        name: "San Francisco",
        flag: "🇺🇸",
        latency: "USA Pantai Barat",
        available: true
    },
    lon1: {
        name: "London",
        flag: "🇬🇧",
        latency: "Eropa Barat",
        available: true
    },
    fra1: {
        name: "Frankfurt",
        flag: "🇩🇪",
        latency: "Eropa Tengah",
        available: true
    },
    ams3: {
        name: "Amsterdam",
        flag: "🇳🇱",
        latency: "Eropa Barat",
        available: true
    },
    tor1: {
        name: "Toronto",
        flag: "🇨🇦",
        latency: "Amerika Utara",
        available: true
    },
    blr1: {
        name: "Bangalore",
        flag: "🇮🇳",
        latency: "Asia Selatan",
        available: true
    }
};

const vpsImages = {
    // ===== UBUNTU =====
    ubuntu2404: {
        image: "ubuntu-24-04-x64",
        name: "Ubuntu 24.04 LTS",
        icon: "🐧",
        description: "Latest Ubuntu LTS",
        slug: "ubuntu-24-04-x64"
    },
    ubuntu2204: {
        image: "ubuntu-22-04-x64",
        name: "Ubuntu 22.04 LTS",
        icon: "🐧",
        description: "Stable Ubuntu LTS",
        slug: "ubuntu-22-04-x64"
    },
    ubuntu2004: {
        image: "ubuntu-20-04-x64",
        name: "Ubuntu 20.04 LTS",
        icon: "🐧",
        description: "Previous Ubuntu LTS",
        slug: "ubuntu-20-04-x64"
    },
    ubuntu2404_minimal: {
        image: "ubuntu-24-04-x64",
        name: "Ubuntu 24.04 Minimal",
        icon: "🐧",
        description: "Minimal Ubuntu 24.04",
        slug: "ubuntu-24-04-x64"
    },

    // ===== DEBIAN =====
    debian12: {
        image: "debian-12-x64",
        name: "Debian 12",
        icon: "📦",
        description: "Debian 12 Bookworm",
        slug: "debian-12-x64"
    },
    debian11: {
        image: "debian-11-x64",
        name: "Debian 11",
        icon: "📦",
        description: "Debian 11 Bullseye",
        slug: "debian-11-x64"
    },
    debian10: {
        image: "debian-10-x64",
        name: "Debian 10",
        icon: "📦",
        description: "Debian 10 Buster",
        slug: "debian-10-x64"
    },

    // ===== CENTOS =====
    centos9: {
        image: "centos-stream-9-x64",
        name: "CentOS Stream 9",
        icon: "🎯",
        description: "CentOS Stream 9",
        slug: "centos-stream-9-x64"
    },
    centos8: {
        image: "centos-stream-8-x64",
        name: "CentOS Stream 8",
        icon: "🎯",
        description: "CentOS Stream 8",
        slug: "centos-stream-8-x64"
    },

    // ===== ROCKY LINUX =====
    rocky9: {
        image: "rockylinux-9-x64",
        name: "Rocky Linux 9",
        icon: "🪨",
        description: "Rocky Linux 9",
        slug: "rockylinux-9-x64"
    },
    rocky8: {
        image: "rockylinux-8-x64",
        name: "Rocky Linux 8",
        icon: "🪨",
        description: "Rocky Linux 8",
        slug: "rockylinux-8-x64"
    },

    // ===== ALMA LINUX =====
    alma9: {
        image: "almalinux-9-x64",
        name: "AlmaLinux 9",
        icon: "🌟",
        description: "AlmaLinux 9",
        slug: "almalinux-9-x64"
    },
    alma8: {
        image: "almalinux-8-x64",
        name: "AlmaLinux 8",
        icon: "🌟",
        description: "AlmaLinux 8",
        slug: "almalinux-8-x64"
    },

    // ===== FEDORA =====
    fedora40: {
        image: "fedora-40-x64",
        name: "Fedora 40",
        icon: "🎩",
        description: "Fedora 40",
        slug: "fedora-40-x64"
    },
    fedora39: {
        image: "fedora-39-x64",
        name: "Fedora 39",
        icon: "🎩",
        description: "Fedora 39",
        slug: "fedora-39-x64"
    }
};

function getOSAdditionalCost(osKey) {
    return { additional: false, cost: 0 };
}

function validateOSForRegion(osKey, regionKey) {
    return { valid: true, message: "" };
}

function generateStrongPassword() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@";
    let password = "";
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}


async function createVPSDroplet(apiKey, hostname, spec, os, region, password) {
    // Validasi input
    if (!vpsSpecs[spec]) {
        throw new Error(`Spec "${spec}" tidak valid. Pilihan: ${Object.keys(vpsSpecs).join(', ')}`);
    }

    if (!vpsImages[os]) {
        throw new Error(`OS "${os}" tidak valid. Pilihan: ${Object.keys(vpsImages).join(', ')}`);
    }

    // Data droplet sesuai dokumentasi resmi
    const dropletData = {
        name: hostname.toLowerCase().trim().substring(0, 63), // Max 63 karakter
        region: region,
        size: vpsSpecs[spec].size,
        image: vpsImages[os].image,

        // Optional parameters sesuai dokumentasi
        ssh_keys: [], // Array of SSH key IDs (bisa kosong)
        backups: false, // Disable automatic backups
        ipv6: true, // Enable IPv6
        monitoring: true, // Enable monitoring
        tags: [
            "autoorder-vps",
            "telegram-bot",
            `user-${hostname}`,
            new Date().toISOString().split("T")[0] // YYYY-MM-DD
        ],

        // Cloud-config untuk set password root
        user_data: `#cloud-config\npassword: ${password}\nchpasswd: { expire: false }\nssh_pwauth: true`
    };

    try {
        console.log(`Creating droplet with data:`, JSON.stringify(dropletData, null, 2));

        const response = await fetch("https://api.digitalocean.com/v2/droplets", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "User-Agent": "AutoOrder-Bot/1.0"
            },
            body: JSON.stringify(dropletData)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Digital Ocean API Error:", {
                status: response.status,
                statusText: response.statusText,
                error: data
            });

            let errorMsg = data.message || `HTTP ${response.status}: ${response.statusText}`;

            // Error messages spesifik
            if (data.id === "forbidden") {
                errorMsg = "API Key tidak valid atau expired";
            } else if (data.id === "unprocessable_entity") {
                errorMsg = `Invalid request: ${data.message || "Check your parameters"}`;
            } else if (response.status === 429) {
                errorMsg = "Rate limit exceeded, coba lagi nanti";
            }

            throw new Error(errorMsg);
        }

        if (!data.droplet || !data.droplet.id) {
            throw new Error("Invalid response format from Digital Ocean API");
        }

        console.log(`Droplet created successfully: ${data.droplet.id}`);
        return data.droplet.id;

    } catch (error) {
        console.error("Create VPS Droplet Error:", error);
        throw new Error(`Gagal membuat VPS: ${error.message}`);
    }
}

async function getDropletInfo(apiKey, dropletId) {
    try {
        const response = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "User-Agent": "AutoOrder-Bot/1.0"
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}: Failed to get droplet info`);
        }

        const data = await response.json();

        if (!data.droplet) {
            throw new Error("Invalid response: droplet data missing");
        }

        return data.droplet;

    } catch (error) {
        console.error("Get Droplet Info Error:", error);
        throw new Error(`Failed to get droplet info: ${error.message}`);
    }
}

module.exports = { createAdmin, createPanel, createPayment, cekPaid, createVPSDroplet, getDropletInfo, vpsImages, vpsRegions, vpsSpecs, generateStrongPassword, getOSAdditionalCost, validateOSForRegion };