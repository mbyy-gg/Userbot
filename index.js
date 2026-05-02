require("./lib/myfunc.js");
const fs = require("fs");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");
const { Telegraf } = require("telegraf");
const config = require("./config");

(async () => {
console.log("=".repeat(50));
console.log("AUTOORDER BOT STARTING");
console.log("=".repeat(50));

let client = null;
let bot = null;
let userbotConnected = false;
let botConnected = false;

/* ================= USERBOT ================= */
if (config.apiId && config.apiHash) {
  try {
    console.log("• Menghubungkan UserBot");

    const session = fs.existsSync(config.sessionFile)
      ? fs.readFileSync(config.sessionFile, "utf8")
      : "";

    const stringSession = new StringSession(session);

    client = new TelegramClient(
      stringSession,
      config.apiId,
      config.apiHash,
      { connectionRetries: 4 }
    );

    await client.start({
      phoneNumber: async () => config.phoneNumber,
      password: async () => await input.text("Password 2FA (Enter jika tidak ada): \n"),
      phoneCode: async () => await input.text("Kode verifikasi: \n"),
      onError: err => console.log("• UserBot Error:", err.message)
    });

    fs.writeFileSync(config.sessionFile, client.session.save());
    console.log("• UserBot Connected");
    userbotConnected = true;

    try {
      if (global.StartTelegram) await global.StartTelegram(client, Api);
      await client.getDialogs();
    } catch (err) {
      console.log("• Tidak bisa load dialogs:", err.message);
    }

  } catch (err) {
    console.log("• UserBot gagal:", err.message);
    console.log("• Lanjut tanpa UserBot");
    client = null;
  }
} else {
  console.log("• API ID / Hash tidak ditemukan, skip UserBot");
}

/* ================= BOT ================= */
if (config.botToken) {
  try {
    console.log("• Menghubungkan Bot Telegram");

    bot = new Telegraf(config.botToken);
    bot.launch();

    const userCommands = [
      { command: "menu", description: "Tampilkan Menu Utama" },
      { command: "start", description: "Mulai bot" },
      { command: "buypanel", description: "Beli Panel Pterodactyl" },
      { command: "buyadmin", description: "Beli Admin Panel" },
      { command: "buyscript", description: "Beli Script" },
      { command: "buyapps", description: "Beli Apps Premium" },
      { command: "buydo", description: "Beli Akun Digital Ocean" },
      { command: "buyvps", description: "Beli VPS Digital Ocean" },
      { command: "cekstok", description: "Cek Stok" },
      { command: "profile", description: "Lihat Profile" },
      { command: "history", description: "Riwayat Transaksi" }
    ];

    const ownerCommands = [
      { command: "backup", description: "Backup database" },
      { command: "broadcast", description: "Broadcast pesan" },
      { command: "addscript", description: "Tambah script" },
      { command: "getscript", description: "Ambil script" },
      { command: "delscript", description: "Hapus script" },
      { command: "addstock", description: "Tambah stock apps" },
      { command: "delstock", description: "Hapus stock apps" },
      { command: "getstock", description: "Lihat stock apps" },
      { command: "addstockdo", description: "Tambah stock DO" },
      { command: "delstockdo", description: "Hapus stock DO" },
      { command: "getstockdo", description: "Lihat stock DO" },
      { command: "userlist", description: "Daftar user" }
    ];

    await bot.telegram.setMyCommands(userCommands);
    console.log("• User commands diatur");

    if (config.ownerId) {
      try {
        await bot.telegram.setMyCommands(
          [...userCommands, ...ownerCommands],
          { scope: { type: "chat", chat_id: config.ownerId } }
        );
        console.log("• Owner commands diatur");
      } catch (err) {
        console.log("• Gagal set owner commands:", err.message);
      }
    }

    console.log("• Bot Connected");
    botConnected = true;

  } catch (err) {
    console.log("• Bot gagal:", err.message);
    console.log("• Lanjut tanpa Bot");
    bot = null;
  }
} else {
  console.log("• Bot token tidak ditemukan");
}

/* ================= STATUS ================= */
console.log("=".repeat(50));
console.log("STATUS KONEKSI");
console.log(`• UserBot: ${userbotConnected ? "AKTIF" : "TIDAK AKTIF"}`);
console.log(`• Bot    : ${botConnected ? "AKTIF" : "TIDAK AKTIF"}`);
console.log("=".repeat(50));

if (!userbotConnected && !botConnected) {
  console.log("• Tidak ada koneksi berhasil");
  console.log("• Periksa config.js");
  process.exit(1);
}

/* ================= LOAD MODULE ================= */
try {
  if (bot && client) {
    require("./userbot")(client, bot);
    require("./bot")(bot);
    console.log("• Mode: Full");
  } else if (bot) {
    require("./bot")(bot);
    console.log("• Mode: Bot only");
  } else if (client) {
    require("./userbot")(client, null);
    console.log("• Mode: UserBot only");
  }
} catch (err) {
  console.log("• Error load module:", err.message);
}

console.log("• Bot siap digunakan");
console.log("• Gunakan /menu");
console.log("=".repeat(50));

/* ================= SHUTDOWN ================= */
process.once("SIGINT", async () => {
  console.log("• Menghentikan bot");

  if (bot) await bot.stop().catch(() => {});
  if (client) await client.disconnect().catch(() => {});

  console.log("• Shutdown selesai");
  process.exit(0);
});

process.once("SIGTERM", async () => {
  if (bot) await bot.stop().catch(() => {});
  if (client) await client.disconnect().catch(() => {});
  process.exit(0);
});
})();