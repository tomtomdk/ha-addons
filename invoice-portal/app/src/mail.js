const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");

function imapConfigured(settings) {
  return Boolean(settings.imap_host && settings.imap_port && settings.imap_user && settings.imap_pass);
}

function createImapClient(settings) {
  return new ImapFlow({
    host: settings.imap_host,
    port: Number(settings.imap_port || 993),
    secure: Number(settings.imap_secure || 1) === 1,
    auth: {
      user: settings.imap_user,
      pass: settings.imap_pass
    },
    logger: false
  });
}

function hasSeenFlag(flags) {
  if (!flags) return false;

  const values = Array.from(flags).map((flag) => String(flag).replace(/\\/g, "").toLowerCase());
  return values.includes("seen");
}

function addressText(addressObj) {
  if (!addressObj || !Array.isArray(addressObj.value)) return "";
  return addressObj.value.map((item) => {
    if (item.name && item.address) return `${item.name} <${item.address}>`;
    return item.address || item.name || "";
  }).filter(Boolean).join(", ");
}

async function listInboxMessages(settings, limit = 25) {
  const client = createImapClient(settings);
  const mailboxName = settings.imap_mailbox || "INBOX";

  await client.connect();

  try {
    const lock = await client.getMailboxLock(mailboxName);
    try {
      const status = await client.status(mailboxName, { messages: true });
      const total = Number(status.messages || 0);
      if (total <= 0) return [];

      const end = total;
      const start = Math.max(1, total - Number(limit || 25) + 1);
      const messages = [];

      for await (const msg of client.fetch(`${start}:${end}`, {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        size: true
      })) {
        const flags = Array.from(msg.flags || []);

        messages.push({
          uid: msg.uid,
          subject: msg.envelope?.subject || "(uden emne)",
          from: msg.envelope?.from?.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(", ") || "",
          date: msg.internalDate,
          flags,
          seen: hasSeenFlag(flags),
          size: msg.size || 0
        });
      }

      messages.sort((a, b) => Number(b.uid) - Number(a.uid));
      return messages;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

async function readMessage(settings, uid, markAsRead = true) {
  const client = createImapClient(settings);
  const mailboxName = settings.imap_mailbox || "INBOX";

  await client.connect();

  try {
    const lock = await client.getMailboxLock(mailboxName);
    try {
      const msg = await client.fetchOne(Number(uid), {
        uid: true,
        source: true,
        envelope: true,
        flags: true,
        internalDate: true
      }, { uid: true });

      if (!msg) return null;

      if (markAsRead) {
        await client.messageFlagsAdd(Number(uid), ["\\Seen"], { uid: true });
      }

      const parsed = await simpleParser(msg.source);

      return {
        uid: msg.uid,
        subject: parsed.subject || msg.envelope?.subject || "(uden emne)",
        from: addressText(parsed.from),
        to: addressText(parsed.to),
        cc: addressText(parsed.cc),
        date: parsed.date || msg.internalDate,
        text: parsed.text || "",
        html: parsed.html || "",
        seen: true,
        attachments: (parsed.attachments || []).map((a) => ({
          filename: a.filename || "attachment",
          contentType: a.contentType,
          size: a.size
        }))
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

async function getUnreadCount(settings) {
  const client = createImapClient(settings);
  const mailboxName = settings.imap_mailbox || "INBOX";

  await client.connect();

  try {
    const lock = await client.getMailboxLock(mailboxName);

    try {
      // More reliable than STATUS unseen on some cPanel/IMAP servers.
      // Search for messages that do not have the \\Seen flag.
      const unseenUids = await client.search({ seen: false }, { uid: true });
      return Array.isArray(unseenUids) ? unseenUids.length : 0;
    } finally {
      lock.release();
    }
  } catch (_searchError) {
    // Fallback for servers where SEARCH behaves differently.
    try {
      const status = await client.status(mailboxName, { unseen: true });
      return Number(status.unseen || 0);
    } catch {
      return 0;
    }
  } finally {
    await client.logout();
  }
}

async function setMessageSeen(settings, uid, seen = true) {
  const client = createImapClient(settings);
  const mailboxName = settings.imap_mailbox || "INBOX";

  await client.connect();

  try {
    const lock = await client.getMailboxLock(mailboxName);

    try {
      if (seen) {
        await client.messageFlagsAdd(Number(uid), ["\\Seen"], { uid: true });
      } else {
        await client.messageFlagsRemove(Number(uid), ["\\Seen"], { uid: true });
      }

      return true;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

module.exports = {
  imapConfigured,
  listInboxMessages,
  readMessage,
  getUnreadCount,
  setMessageSeen
};
