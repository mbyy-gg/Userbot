require("./lib/myfunc.js");
const fs = require("fs");
const { NewMessage } = require("telegram/events");
const axios = require("axios");
const rimraf = require("rimraf");
const { Api } = require("telegram");
const archiver = require("archiver");
const config = require("./config");
const path = require("path");
const blFile = "./db/bl.json";
const loadBL = () => JSON.parse(fs.readFileSync(blFile));
const saveBL = d => fs.writeFileSync(blFile, JSON.stringify(d, null, 2));

async function sendInline(client, chatId, query) {
  const botEntity = await client.getInputEntity(config.botUsername);
  const peer = await client.getInputEntity(chatId);
  const results = await client.invoke(new Api.messages.GetInlineBotResults({ bot: botEntity, peer, query, offset: "" }));
  if (results.results.length) await client.invoke(new Api.messages.SendInlineBotResult({ peer, queryId: results.queryId, id: results.results[0].id, hideVia: true }));
}

module.exports = client => {
  client.addEventHandler(async event => {
    const msg = event.message, body = msg.message || "";
    if (!body.startsWith(config.prefix)) return;
    const args = body.trim().split(/ +/).slice(1), text = args.join(" ");
    const prefix = config.prefix
    const command = body.slice(config.prefix.length).trim().split(" ").shift().toLowerCase();
    const cmd = prefix + command
    const chatId = msg.chatId, fromId = msg?.senderId || msg?.fromId?.userId || "";
    const me = await client.getMe();
    const isOwner = fromId.toString() === config.ownerId?.toString() || fromId.toString() === me.id.toString();

    switch (command) {
      case "menu": case "p": case "start": {
        return sendInline(client, chatId, `${prefix}menu`);
        }
        break

      case "proses":
        if (!isOwner) return msg.reply({ message: "❌ Owner only!" });
        if (!text) return client.sendMessage(chatId, { message: `*Ex:* ${cmd} jasa install panel`, replyTo: msg.id, parseMode: "markdownv2" });
        return sendInline(client, chatId, `${prefix}proses ${text}`);
        
      case "buydo": case "buyapps": case "buyapp": case "buyvps": case "buypanel": case "buysc": case "buyadp": case "buyscript": case "buyadmin": {
        return sendInline(client, chatId, `${prefix}buy`);
        }

      case "payment": case "pay":
        return sendInline(client, chatId, `${prefix}payment`);
        
      case "delpanel": case "delp":
        if (!isOwner) return msg.reply({ message: "❌ Owner only!" });
        return sendInline(client, chatId, `${prefix}delpanel`);
        
      case "deladmin": case "dela":
        if (!isOwner) return msg.reply({ message: "❌ Owner only!" });
        return sendInline(client, chatId, `${prefix}deladmin`);
        
       case "listpanel":
case "listserver": {
  if (!isOwner) return msg.reply({ message: "❌ Owner only!" });
  try {
    const res = await fetch(`${config.domain}/api/application/servers`, {
      method: "GET",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${config.apikey}` }
    });
    const data = await res.json();
    const servers = data.data || [];
    if (!servers.length) return msg.reply({ message: "⚠️ Tidak ada server panel!" });

    let teks = `📊 *Total Server Panel:* ${servers.length}\n`;
    for (const sObj of servers) {
      const s = sObj.attributes;
      const ram = s.limits.memory === 0 ? "Unlimited" : (s.limits.memory >= 1024 ? `${Math.floor(s.limits.memory / 1024)} GB` : `${s.limits.memory} MB`);
      const disk = s.limits.disk === 0 ? "Unlimited" : (s.limits.disk >= 1024 ? `${Math.floor(s.limits.disk / 1024)} GB` : `${s.limits.disk} MB`);
      const cpu = s.limits.cpu === 0 ? "Unlimited" : `${s.limits.cpu}%`;
      const domainClean = (config.domain || "").replace(/https?:\/\//g,"");

      teks += `
*📡 Server ID:* ${s.id}
*👤 Nama:* ${s.name}
*💾 RAM:* ${ram}
*🖥️ Disk:* ${disk}
*🚀 CPU:* ${cpu}
*⏰ Dibuat:* ${s.created_at?.split("T")[0] || "-"}\n`;
    }

    await client.sendMessage(msg.chatId, { message: teks.trim(), parseMode: "markdownv2", replyTo: msg.id });

  } catch (err) {
    console.error("Error listpanel:", err);
    msg.reply({ message: "Error! terjadi kesalahan saat mengambil data server panel!" })
  }
  break;
}

case "listadmin": {
  if (!isOwner) return msg.reply({ message: "❌ Owner only!" });
  try {
    const res = await fetch(`${config.domain}/api/application/users`, {
      method: "GET",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${config.apikey}` }
    });
    const data = await res.json();
    const users = data.data || [];
    const admins = users.filter(u => u.attributes.root_admin);

    if (!admins.length) return msg.reply({ message: "⚠️ Tidak ada admin panel!" });

    let teks = `📊 *Total Admin Panel:* ${admins.length}\n`;
    for (const a of admins) {
      const u = a.attributes;
      const domainClean = (config.domain || "").replace(/https?:\/\//g,"");

      teks += `
*📡 User ID:* ${u.id}
*👤 Username:* \`${u.username}\`
*⏰ Dibuat:* ${u.created_at?.split("T")[0] || "-"}\n`;
    }

    await client.sendMessage(msg.chatId, { message: teks.trim(), parseMode: "markdownv2", replyTo: msg.id });

  } catch (err) {
    console.error("Error listadmin:", err);
    await msg.reply({ message: "Error! terjadi kesalahan saat mengambil data server panel!" });

  }
  break;
}

case "backupsc":
case "bck":
case "backup": {
  if (!isOwner) return msg.reply({ message: "❌ Owner only!" });
  try {
    await msg.reply({ message: "Backup Processing..." });
    const bulanIndo = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const tgl = new Date();
    const tanggal = tgl.getDate().toString().padStart(2, "0");
    const bulan = bulanIndo[tgl.getMonth()];
    const name = `Ubot-${tanggal}-${bulan}-${tgl.getFullYear()}`;

    const exclude = ["node_modules","package-lock.json","yarn.lock",".npm",".cache"];
    const filesToZip = fs.readdirSync(".").filter((f) => !exclude.includes(f) && f !== "");

    if (!filesToZip.length) return msg.reply({ message: "Tidak ada file yang dapat di backup!" });

    const output = fs.createWriteStream(`./${name}.zip`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(output);

    for (let file of filesToZip) {
      const stat = fs.statSync(file);
      if (stat.isDirectory()) archive.directory(file, file);
      else archive.file(file, { name: file });
    }

    await archive.finalize();

    output.on("close", async () => {
      try {
        await client.sendFile(config.ownerId, { file: `./${name}.zip`, caption: "✅ <b>Backup Script selesai!</b>", parseMode: "html" });
        fs.unlinkSync(`./${name}.zip`);
        if (msg.chatId.toString() !== config.ownerId?.toString()) {
          await client.sendMessage(msg.chatId, { message: "✅ <b>Backup script selesai!</b>\nFile telah dikirim ke chat pribadi.", replyTo: msg.id, parseMode: "html" });
        }
      } catch (err) {
        console.error("Gagal kirim file backup:", err);
        await msg.reply({ message: "Error! terjadi kesalahan saat mengirim file." });
      }
    });
  } catch (err) {
    console.error("Backup Error:", err);
    await msg.reply({ message: "Error! terjadi kesalahan saat proses backup." });
  }
  break;
}

case "ping": {
  const os = require("os");
  const nou = require("node-os-utils");
  const speed = require("performance-now");
  const start = speed();
  const cpu = nou.cpu;
  const drive = nou.drive;
  const mem = nou.mem;
  const netstat = nou.netstat;
  const [osName, driveInfo, memInfo, cpuUsage, netStats] = await Promise.all([
    nou.os.oos().catch(() => "Unknown"),
    drive.info().catch(() => ({ usedGb: "N/A", totalGb: "N/A" })),
    mem.info().catch(() => ({ totalMemMb: 0, usedMemMb: 0, freeMemMb: 0 })),
    cpu.usage().catch(() => 0),
    netstat.inOut().catch(() => ({ total: null }))
  ]);
  const totalGB = (memInfo.totalMemMb / 1024 || 0).toFixed(2);
  const usedGB = (memInfo.usedMemMb / 1024 || 0).toFixed(2);
  const freeGB = (memInfo.freeMemMb / 1024 || 0).toFixed(2);
  const cpuList = os.cpus() || [];
  const cpuModel = cpuList[0]?.model || "Unknown CPU";
  const cpuSpeed = cpuList[0]?.speed || "N/A";
  const cpuCores = cpuList.length || 0;
  const vpsUptime = runtime(os.uptime());
  const botUptime = runtime(process.uptime());
  const latency = (speed() - start).toFixed(2);
  const loadAvg = os.loadavg().map(n => n.toFixed(2)).join(" | ");
  const nodeVersion = process.version;
  const platform = os.platform();
  const hostname = os.hostname();
  const arch = os.arch();
  const network = netStats.total
    ? `${netStats.total.inputMb.toFixed(2)} MB ↓ / ${netStats.total.outputMb.toFixed(2)} MB ↑`
    : "N/A";
  const tt = `
<b>⚙️ SYSTEM STATUS</b>
<b>• OS :</b> ${nou.os.type()} (${osName})
<b>• Platform :</b> ${platform.toUpperCase()}
<b>• Arch :</b> ${arch}
<b>• Hostname :</b> ${hostname}

<b>💾 STORAGE</b>
<b>• Disk :</b> ${driveInfo.usedGb}/${driveInfo.totalGb} GB
<b>• RAM :</b> ${usedGB}/${totalGB} GB (Free: ${freeGB} GB)

<b>🧠 CPU INFO</b>
<b>• Model :</b> ${cpuModel}
<b>• Core(s) :</b> ${cpuCores}
<b>• Speed :</b> ${cpuSpeed} MHz
<b>• Usage :</b> ${cpuUsage.toFixed(2)}%
<b>• Load Avg :</b> ${loadAvg}

<b>🤖 BOT STATUS</b>
<b>• Response Time :</b> ${latency} sec
<b>• Bot Uptime :</b> ${botUptime}
<b>• VPS Uptime :</b> ${vpsUptime}
<b>• Node.js :</b> ${nodeVersion}
`;

await client.sendMessage(msg.chatId, {
    message: tt,
    parseMode: "html",
    replyTo: msg.id
  });
}
break;

case "me": {
  const sender = await client.getEntity(msg.senderId);
  const info = `
🆔 ID: <code>${sender.id}</code> (${msg.senderId.toString().length})
📛 Nama: <b>${sender.firstName || ""} ${sender.lastName || ""}</b>
👤 Username: @${sender.username || "-"}
🌐 Bot: ${sender.bot ? "Ya" : "Tidak"}
✅ Premium: ${sender.premium ? "Ya" : "Tidak"}
`;
  await client.sendMessage(msg.chatId, { message: info, replyTo: msg.id, parseMode: "html" });
  break;
}
      case "cfd": {
  if (!isOwner) return msg.reply({ message: "❌ Owner only!" });

  if (!msg.replyTo) 
    return client.sendMessage(chatId, { 
      message: `*Ex:* ${cmd} dengan reply pesan`, 
      replyTo: msg.id, 
      parseMode: "markdownv2" 
    });

  const replied = await msg.getReplyMessage();
  const msgId = replied.id
  const chat = replied.chat
  if (!replied) 
    return msg.reply({ message: "⚠️ Tidak dapat menemukan pesan yang dibalas." });

  const blacklist = loadBL();
  const dialogs = await client.getDialogs();
  const peerFrom = replied.fwdFrom && replied.fwdFrom.fromId?.className == "PeerChannel" 
    ? replied.fwdFrom.fromId 
    : replied.chat;
  const peer = peerFrom

  const targets = dialogs.filter(d => d.isGroup && !blacklist.includes(d.id.toString()));

  msg.reply({ message: `🔁 Forward pesan ke ${targets.length} grup` });

  let sukses = 0, gagal = 0;
  for (const d of targets) {
    try {
      await client.forwardMessages(d.id, { messages: [msgId], fromPeer: chat });
      sukses++;
    } catch (e) {
      gagal++;
      console.log(`[•] Fwd ${d.name || d.title} Error: ${e}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  msg.reply({ 
    message: `✅ Forward selesai!\n\nSukses: ${sukses}\nGagal: ${gagal}\nBlacklist: ${blacklist.length}` 
  });
  break;
}

      case "bl": {
        if (!isOwner) return msg.reply({ message: "❌ Owner only!" });
        if (!msg.isGroup) return msg.reply({ message: "❌ Harus di dalam grup!" });
        const bl = loadBL(), id = chatId.toString();
        if (bl.includes(id)) return msg.reply({ message: "⚠️ Grup sudah ada di blacklist." });
        bl.push(id); saveBL(bl);
        return msg.reply({ message: "✅ Grup berhasil di blacklist." });
      }

      case "delbl": {
        if (!isOwner) return msg.reply({ message: "❌ Owner only!" });
        if (!msg.isGroup) return msg.reply({ message: "❌ Harus di dalam grup!" });
        const bl = loadBL(), id = chatId.toString();
        if (!bl.includes(id)) return msg.reply({ message: "⚠️ Grup tidak ada di blacklist." });
        saveBL(bl.filter(x => x !== id));
        return msg.reply({ message: "✅ Blacklist berhasil dihapus." });
      }
      
      case "subdo":
case "subdomain": {
  if (!isOwner) return msg.reply({ message: "❌ Owner only!" });
  if (!text.includes("|")) return client.sendMessage(chatId, { message: `*Ex:* ${cmd} hostname|ip`, replyTo: msg.id, parseMode: "markdownv2" });
  const obj = Object.keys(config.subdomain || {});
  if (obj.length < 1)
    return msg.reply({ message: "❌ Tidak ada domain tersedia." });
  return sendInline(client, chatId, `${prefix}subdomain ${text}`);
}

case "1gb": case "2gb": case "3gb": case "4gb": case "5gb":
case "6gb": case "7gb": case "8gb": case "9gb": case "10gb":
case "unlimited": case "unli": {
  if (!isOwner)
    return msg.reply({ message: "❌ Owner only!" });

  if (!text)
    return msg.reply({
      message: `*Ex:* ${cmd} username`,
      parseMode: "markdownv2"
    });

  const username = text.toLowerCase();
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

  const { ram, disk, cpu } = resourceMap[command] || { ram: "0", disk: "0", cpu: "0" };

  try {
    // ===== CREATE USER =====
    const f = await fetch(`${config.domain}/api/application/users`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apikey}`,
      },
      body: JSON.stringify({
        email,
        username,
        first_name: name,
        last_name: "Server",
        language: "en",
        password,
      }),
    });
    const data = await f.json();
    if (data.errors)
      return msg.reply({ message: `❌ Error create user:\n${JSON.stringify(data.errors[0], null, 2)}` });

    const user = data.attributes;

    // ===== GET EGG =====
    const f1 = await fetch(`${config.domain}/api/application/nests/${config.nestid}/eggs/${config.egg}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apikey}`,
      },
    });
    const data2 = await f1.json();
    const startup_cmd = data2.attributes?.startup || "npm start";

    // ===== CREATE SERVER =====
    const f2 = await fetch(`${config.domain}/api/application/servers`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apikey}`,
      },
      body: JSON.stringify({
        name,
        description: global.tanggal ? global.tanggal(Date.now()) : new Date().toLocaleString(),
        user: user.id,
        egg: parseInt(config.egg),
        docker_image: "ghcr.io/parkervcp/yolks:nodejs_20",
        startup: startup_cmd,
        environment: {
          INST: "npm",
          USER_UPLOAD: "0",
          AUTO_UPDATE: "0",
          CMD_RUN: "npm start",
        },
        limits: { memory: ram, swap: 0, disk, io: 500, cpu },
        feature_limits: { databases: 5, backups: 5, allocations: 5 },
        deploy: { locations: [parseInt(config.loc)], dedicated_ip: false, port_range: [] },
      }),
    });
    const result = await f2.json();
    if (result.errors)
      return msg.reply({ message: `❌ Error create server:\n${JSON.stringify(result.errors[0], null, 2)}` });

    const server = result.attributes;
    const domainClean = (config.domain || "").replace(/https?:\/\//g, "");

    // ✅ SELESAI → INLINE RESULT
    await sendInline(
      client,
      chatId,
      `${prefix}cpanel-result ${user.username}|${password}|${server.id}|${ram}|${disk}|${cpu}|${domainClean}`
    );

  } catch (err) {
    console.error(err);
    await msg.reply({ message: `❌ Gagal membuat panel:\n${err.message || err}` });
  }
  break;
}


case "cadmin": {
  if (!isOwner) return msg.reply({ message: "❌ Owner only!" });
  if (!text) return msg.reply({
    message: `*Ex:* ${cmd} username`,
    parseMode: "markdownv2"
  });

  const username = text.toLowerCase();
  const email = `${username}@gmail.com`;
  const name = global.capital ? global.capital(username) : username;
  const password = `${username}001`;

  try {
    // ===== CREATE ADMIN USER =====
    const res = await fetch(`${config.domain}/api/application/users`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apikey}`,
      },
      body: JSON.stringify({
        email,
        username,
        first_name: name,
        last_name: "Admin",
        root_admin: true,
        language: "en",
        password
      }),
    });
    const data = await res.json();
    if (data.errors) return msg.reply({ message: `❌ Error create admin:\n${JSON.stringify(data.errors[0], null, 2)}` });
    const user = data.attributes;
    const domainClean = (config.domain || "").replace(/https?:\/\//g, "");
    await sendInline(client, chatId, `${prefix}cadmin-result ${user.username}|${password}|${domainClean}`);

  } catch (err) {
    console.error(err);
    await msg.reply({ message: `❌ Gagal membuat admin:\n${err.message || err}` });
  }
  break;
}


case "cleardb": {
    if (!isOwner) return msg.reply({ message: "❌ Owner only!" });

    let t = text.split("|");
    if (t.length < 2) return msg.reply({
        message: `*Ex:* ${cmd} ipvps|pwvps`,
        parseMode: "markdownv2"
    });

    const { Client: SSHClient } = require("ssh2");
    const net = require("net");
    let [ipvps, passwd] = t;
    const connSettings = { host: ipvps, port: 22, username: "root", password: passwd };

    async function waitForSSH(host, port = 22, timeout = 300) {
        return new Promise((resolve, reject) => {
            let elapsed = 0;
            const interval = setInterval(() => {
                const socket = new net.Socket();
                socket.setTimeout(2000);
                socket.on("connect", () => { clearInterval(interval); socket.destroy(); resolve(true); });
                socket.on("error", () => socket.destroy());
                socket.on("timeout", () => socket.destroy());
                socket.connect(port, host);

                elapsed += 2;
                if (elapsed >= timeout) { clearInterval(interval); reject(new Error("VPS tidak merespon SSH setelah reboot")); }
            }, 2000);
        });
    }

    const ssh = new SSHClient();

    ssh.on("ready", async () => {
        try {
            // 1️⃣ Restart VPS dulu
            await new Promise((res, rej) => {
                ssh.exec("sudo reboot", (err, stream) => {
                    if (err) return rej(err);
                    stream.on("close", () => res()).on("data", () => {}).stderr.on("data", () => {});
                });
            });
            ssh.end();
            client.sendMessage(msg.chatId, { message: "♻️ VPS direstart, menunggu aktif kembali...", replyTo: msg.id });

            // 2️⃣ Tunggu VPS aktif lagi
            await waitForSSH(ipvps);
            client.sendMessage(msg.chatId, { message: "✅ VPS sudah aktif kembali, menjalankan uninstall panel + cleardb...", replyTo: msg.id });

            // 3️⃣ SSH baru untuk uninstall panel + cleardb
            const ssh2 = new SSHClient();
            ssh2.on("ready", () => {

                const uninstallCommand = `bash <(curl -s https://pterodactyl-installer.se)`;
                const cleardbCommand = `
sudo dpkg --configure -a
sudo DEBIAN_FRONTEND=noninteractive apt-get purge -y mariadb-server mariadb-client mariadb-common mysql-common mysql-server-core-* mysql-client-core-*
sudo apt-get autoremove -y
sudo rm -rf /var/lib/mysql /etc/mysql
echo "✅ Panel dan Database MySQL/MariaDB berhasil dibersihkan!"
sudo reboot
`.trim();

                ssh2.exec(uninstallCommand, { pty: true }, (err, stream) => {
                    if (err) return client.sendMessage(msg.chatId, { message: "❌ Gagal menjalankan uninstall panel", replyTo: msg.id });

                    stream.on('close', async () => {
                        // Setelah uninstall panel selesai, jalankan cleardb
                        ssh2.exec(cleardbCommand, { pty: true }, (err, stream2) => {
                            if (err) return client.sendMessage(msg.chatId, { message: "❌ Gagal menjalankan cleardb", replyTo: msg.id });

                            stream2.on("close", async (code) => {
                                if (code === 0) {
                                    await client.sendMessage(msg.chatId, { message: "✅ Uninstall panel + Cleardb selesai!", replyTo: msg.id });
                                } else {
                                    await client.sendMessage(msg.chatId, { message: "⚠ Terjadi error saat menjalankan cleardb.", replyTo: msg.id });
                                }
                                ssh2.end();
                            }).on("data", data => console.log("OUTPUT:", data.toString()))
                              .stderr.on("data", data => console.log("STDERR:", data.toString()));
                        });
                    }).on("data", (data) => {
                        console.log("OUTPUT uninstall:", data.toString());
                        // Automasi input prompt installer
                        if (data.toString().includes('Input 0-6')) stream.write("6\n");
                        if (data.toString().includes('(y/N)')) stream.write("y\n");
                        if (data.toString().includes('Choose the panel user')) stream.write("\n");
                        if (data.toString().includes('Choose the panel database')) stream.write("\n");
                    }).stderr.on('data', (data) => {
                        console.log("STDERR uninstall:", data.toString());
                    });
                });

            }).on("error", err => {
                client.sendMessage(msg.chatId, { message: `❌ Gagal SSH setelah reboot: ${err.message}`, replyTo: msg.id });
            }).connect(connSettings);

        } catch (e) {
            client.sendMessage(msg.chatId, { message: `❌ Error: ${e.message}`, replyTo: msg.id });
        }

    }).on("error", err => {
        client.sendMessage(msg.chatId, { message: `❌ Gagal terhubung ke VPS: ${err.message}`, replyTo: msg.id });
    }).connect(connSettings);
}
break;

case "startwings":
case "configurewings": {
    if (!isOwner) return msg.reply({ message: "❌ Owner only!" });
    let t = text.split("|");
    if (t.length < 3) return msg.reply({
    message: `*Ex:* ${cmd} ipvps|pwvps|token`,
    parseMode: "markdownv2"
  });
    const { Client: SSHClient } = require("ssh2");
    let [ipvps, passwd, token] = t
    const connSettings = { host: ipvps, port: 22, username: "root", password: passwd };
    const ssh = new SSHClient();

    ssh.on("ready", () => {
        ssh.exec(`${token} && systemctl start wings`, (err, stream) => {
            if (err) return client.sendMessage(msg.chatId, { message: "Gagal menjalankan perintah di VPS", replyTo: msg.id });

            stream.on("close", async () => {
                await client.sendMessage(msg.chatId, { message: "✅ Wings node Pterodactyl berhasil dijalankan!", replyTo: msg.id });
                ssh.end();
            }).on("data", data => stream.write("y\n\n"))
              .stderr.on("data", data => {
                  console.log("STDERR:", data.toString());
                  client.sendMessage(msg.chatId, { message: `Terjadi error saat eksekusi:\n${data.toString()}`, replyTo: msg.id });
              });
        });
    }).on("error", err => {
        console.log("Connection Error:", err.message);
        client.sendMessage(msg.chatId, { message: "Gagal terhubung ke VPS: IP atau password salah.", replyTo: msg.id });
    }).connect(connSettings);
}
break;

case "installpanel": {
  if (!isOwner) return msg.reply({ message: "❌ Owner only!" });

  if (!text)
    return client.sendMessage(chatId, {
      message: `*Ex:* ${cmd} ip|pw|panel.com|node.com|ram`,
      replyTo: msg.id,
      parseMode: "markdownv2",
    });

  const vii = text.split("|");
  if (vii.length < 5)
    return client.sendMessage(chatId, {
      message: `*Ex:* ${cmd} ip|pw|panel.com|node.com|ram`,
      replyTo: msg.id,
      parseMode: "markdownv2",
    });

  const { Client: SSHClient } = require("ssh2");
  const ssh = new SSHClient();

  const ipVps = vii[0];
  const pwVps = vii[1];
  const domainpanel = vii[2];
  const domainnode = vii[3];
  const ramserver = vii[4];

  const passwordPanel = "admin001";
  const commandPanel = `bash <(curl -s https://pterodactyl-installer.se)`;

  const connSettings = {
    host: ipVps,
    port: "22",
    username: "root",
    password: pwVps,
  };

  await client.sendMessage(chatId, {
    message:
`🛠️ *Memulai instalasi panel...*

📡 IP: \`${ipVps}\`
🌐 Panel: \`${domainpanel}\`

⏳ Mohon tunggu ±10–20 menit.`,
    replyTo: msg.id,
    parseMode: "markdownv2",
  });

  async function instalPanel() {
    ssh.exec(commandPanel, (err, stream) => {
      if (err) return msg.reply({ message: `❌ Gagal installer panel: ${err.message}` });

      stream.on("data", (data) => {
        const str = data.toString();
        console.log("Panel:", str);

        if (str.includes("Input 0-6")) stream.write("0\n");
        if (str.includes("(y/N)")) stream.write("y\n");
        if (str.includes("Database name")) stream.write("\n");
        if (str.includes("Database username")) stream.write("admin\n");
        if (str.includes("Password")) stream.write("admin\n");
        if (str.includes("Select timezone")) stream.write("Asia/Jakarta\n");
        if (str.includes("Provide the email")) stream.write("admin@gmail.com\n");
        if (str.includes("Email address for the initial admin")) stream.write("admin@gmail.com\n");
        if (str.includes("Username for the initial")) stream.write("admin\n");
        if (str.includes("First name")) stream.write("admin\n");
        if (str.includes("Last name")) stream.write("admin\n");
        if (str.includes("Password for the initial admin account")) stream.write(`${passwordPanel}\n`);
        if (str.includes("Set the FQDN of this panel")) stream.write(`${domainpanel}\n`);
        if (str.includes("Do you want to automatically configure UFW")) stream.write("y\n");
        if (str.includes("Do you want to automatically configure HTTPS")) stream.write("y\n");
        if (str.includes("Select the appropriate number")) stream.write("1\n");
        if (str.includes("(Y)es/(N)o")) stream.write("y\n");
        if (str.includes("(yes/no)")) stream.write("y\n");
        if (str.includes("(A)gree")) stream.write("A\n");
      })
      .on("close", () => instalWings());
    });
  }

  async function instalWings() {
    ssh.exec(commandPanel, (err, stream) => {
      if (err) return msg.reply({ message: `❌ Gagal installer wings: ${err.message}` });

      stream.on("data", (data) => {
        const str = data.toString();
        console.log("Wings:", str);

        if (str.includes("Input 0-6")) stream.write("1\n");
        if (str.includes("(y/N)")) stream.write("y\n");
        if (str.includes("Enter the panel address")) stream.write(`${domainpanel}\n`);
        if (str.includes("Database host username")) stream.write("admin\n");
        if (str.includes("Database host password")) stream.write("admin\n");
        if (str.includes("Set the FQDN")) stream.write(`${domainnode}\n`);
        if (str.includes("Enter email address")) stream.write("admin@gmail.com\n");
      })
      .on("close", () => InstallNodes());
    });
  }

  async function InstallNodes() {
    ssh.exec(
      "bash <(curl -s https://raw.githubusercontent.com/SkyzoOffc/Pterodactyl-Theme-Autoinstaller/main/createnode.sh)",
      (err, stream) => {
        if (err) return msg.reply({ message: `❌ Gagal buat node: ${err.message}` });

        stream.on("data", (data) => {
          const str = data.toString();
          console.log("Node:", str);

          if (str.includes("Masukkan nama lokasi")) stream.write("Singapore\n");
          if (str.includes("Masukkan deskripsi lokasi")) stream.write("Node By Bot\n");
          if (str.includes("Masukkan domain")) stream.write(`${domainnode}\n`);
          if (str.includes("Masukkan nama node")) stream.write("Skyzopedia\n");
          if (str.includes("Masukkan RAM")) stream.write(`${ramserver}\n`);
          if (str.includes("Masukkan jumlah maksimum disk")) stream.write(`${ramserver}\n`);
          if (str.includes("Masukkan Locid")) stream.write("1\n");
        })
        .on("close", async () => {
          // ✅ SEMUA SELESAI → inline bot result
          await sendInline(
            client,
            chatId,
            `${prefix}installpanel-result ${domainpanel}|admin|${passwordPanel}|${ipVps}|${pwVps}`
          );
          ssh.end();
        });
      }
    );
  }

  ssh.on("ready", async () => instalPanel());

  ssh.on("error", (err) => {
    console.error("SSH Error:", err);
    msg.reply({ message: `❌ SSH Error: ${err.message}` });
  });

  ssh.connect(connSettings);
}
break;

case "tourl": {
  let targetMessage;
  if (msg.replyToMsgId) {
    try {
      const replied = await msg.getReplyMessage();
      if (replied) {
        targetMessage = replied;
      }
    } catch (error) {
      console.error("Gagal mengambil pesan yang dibalas:", error.message);
    }
  }

  const msgMedia = targetMessage?.media;

  if (!msgMedia) {
    return msg.reply({
      message: `Reply media (foto, video, atau dokumen) untuk menggunakannya.`
    });
  }

  let buffer;
  try {
    buffer = await targetMessage.downloadMedia({
      downloadUrl: false
    });
  } catch (error) {
    console.error("Gagal mendownload media:", error.message);
    return msg.reply({
      message: `❌ Gagal mendownload media.`
    });
  }

  if (!buffer) {
    return msg.reply({
      message: `❌ Gagal mendapatkan data buffer dari media.`
    });
  }

  const FormData = (await import("form-data")).default;
  const { fileTypeFromBuffer } = await import("file-type");
  const fetchModule = await import("node-fetch");
  const fetch = fetchModule.default;

  async function uploadToCatbox(buf) {
    let { ext } = await fileTypeFromBuffer(buf);
    let bodyForm = new FormData();
    bodyForm.append("fileToUpload", buf, "file." + ext);
    bodyForm.append("reqtype", "fileupload");

    let res = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: bodyForm
    });

    return await res.text();
  }

  try {
    const url = await uploadToCatbox(buffer);
    await msg.reply({
      message: `✅ Media berhasil diupload:\n${url}`
    });
  } catch (error) {
    console.error("Gagal upload ke Catbox:", error.message);
    await msg.reply({
      message: `❌ Terjadi kesalahan saat mengupload media.`
    });
  }
}
break;

case "tourl2": {
  let targetMessage;

  if (msg.replyToMsgId) {
    try {
      const replied = await msg.getReplyMessage();
      if (replied) targetMessage = replied;
    } catch {}
  }

  const msgMedia = targetMessage?.media;
  if (!msgMedia) {
    return msg.reply({
      message: "Reply gambar untuk menggunakan Pixhost."
    });
  }

  let buffer;
  try {
    buffer = await targetMessage.downloadMedia({ downloadUrl: false });
  } catch {
    return msg.reply({ message: "❌ Gagal mendownload media." });
  }

  if (!buffer) {
    return msg.reply({ message: "❌ Buffer media kosong." });
  }

  const { ImageUploadService } = require("node-upload-images");

  async function uploadImageBuffer(buffer) {
    try {
      const service = new ImageUploadService("pixhost.to");
      const { directLink } = await service.uploadFromBinary(buffer, "image.png");
      return directLink || null;
    } catch {
      return null;
    }
  }

  try {
    const url = await uploadImageBuffer(buffer);
    if (!url) throw new Error();

    return msg.reply({
      message: `✅ Upload Pixhost berhasil:\n${url}`
    });
  } catch {
    return msg.reply({
      message: "❌ Gagal upload ke Pixhost (hanya support gambar)."
    });
  }
}
break;

case "npmdl": {
  if (!isOwner) return msg.reply({ message: "❌ Owner only!" });

  if (!text) {
    return msg.reply({
      message: `*Ex:* ${cmd} @whiskeysockets/baileys`,
      parseMode: "markdownv2"
    });
  }

  try {
    const axios = require("axios");
    const fs = require("fs");
    const path = require("path");
    const tar = require("tar");
    const archiver = require("archiver");

    const pkgName = text.trim();

    await msg.reply({
      message: `📦 Mengambil data package *${pkgName}*...`,
      parseMode: "markdownv2"
    });

    // ===== INFO PACKAGE =====
    const info = await axios.get(
      `https://registry.npmjs.org/${encodeURIComponent(pkgName)}`
    );

    const version = info.data["dist-tags"].latest;

    const meta = await axios.get(
      `https://registry.npmjs.org/${encodeURIComponent(pkgName)}/${version}`
    );

    const tarballUrl = meta.data?.dist?.tarball;
    if (!tarballUrl) {
      return msg.reply({ message: "❌ Tarball tidak ditemukan." });
    }

    // ===== PATH =====
    const tmpDir = path.join(process.cwd(), "sampah");
    const safeName = pkgName.replace(/[\/@]/g, "_");

    const tarPath = path.join(tmpDir, `${safeName}-${version}.tgz`);
    const extractPath = path.join(tmpDir, `${safeName}-${version}`);
    const zipPath = path.join(tmpDir, `${safeName}-${version}.zip`);

    // ===== PREPARE =====
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    if (!fs.existsSync(extractPath)) fs.mkdirSync(extractPath, { recursive: true });

    // ===== DOWNLOAD =====
    const res = await axios.get(tarballUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(tarPath, res.data);

    // ===== EXTRACT =====
    await tar.x({
      file: tarPath,
      cwd: extractPath,
      strip: 1
    });

    // ===== ZIP =====
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(extractPath, false);
    archive.finalize();

    // ===== WAIT ZIP FINISH =====
    await new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
    });

    // ===== SEND FILE =====
    await client.sendFile(msg.chatId, {
      file: zipPath,
      caption: `✅ <b>${pkgName}@${version}</b> berhasil diunduh`,
      parseMode: "html",
      replyTo: msg.id
    });

    // ===== CLEANUP =====
    try {
    fs.unlinkSync(tarPath);
    } catch {}
    
    try {
      fs.rmSync(extractPath, { recursive: true, force: true });
      fs.unlinkSync(zipPath);
      rimraf.sync(tmpDir)
    } catch (e) {
      console.error("CLEANUP ERROR:", e);
    }

  } catch (err) {
    console.error("NPMDL ERROR:", err);
    await msg.reply({
      message: `❌ Gagal mengunduh package.\nPastikan nama package benar.\n\n${err.message}`
    });
  }
}
break;

case "eval":
case "ev": {
  if (!isOwner) return;
  if (!text) return msg.reply({ message: `Masukan kode untuk di evaluasi.` });

  try {
    let result = await eval(`(async () => { ${text} })()`);
    if (typeof result !== "string")
      result = require("util").inspect(result, { depth: 1 });

    if (result.length > 4000) {
      const fs = require("fs");
      const filePath = "./eval_result.txt";
      fs.writeFileSync(filePath, result);

      await client.sendFile(msg.chatId, {
        file: filePath,
        caption: "✅ Eval berhasil (hasil dikirim sebagai file)",
      });

      fs.unlinkSync(filePath);
    } else {
      await client.sendMessage(msg.chatId, {
        message: `<b>✅ Eval berhasil:</b>\n<pre>${result}</pre>`,
        parseMode: "html",
      });
    }
  } catch (err) {
    await client.sendMessage(msg.chatId, {
      message: `<b>❌ Eval error:</b>\n<pre>${err}</pre>`,
      parseMode: "html",
    });
  }
  }
  break

      default:
        break;
    }
  }, new NewMessage({}));
};

// ===== HOT RELOAD =====
let file = require.resolve(__filename);
fs.watchFile(file, () => { fs.unwatchFile(file); delete require.cache[file]; require(file); });