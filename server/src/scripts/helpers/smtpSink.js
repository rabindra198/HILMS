const net = require("net");

// A minimal but real SMTP responder: speaks the wire protocol over a TCP socket
// so nodemailer performs a genuine EHLO/AUTH/MAIL/RCPT/DATA conversation rather
// than calling an in-process stub. Captures each DATA payload.
const createSmtpSink = ({ port = 2525, requireAuth = false } = {}) => {
  const messages = [];
  const credentials = [];

  const server = net.createServer((socket) => {
    socket.write("220 localhost ESMTP hilms-sink\r\n");
    let inData = false;
    let buffer = "";
    let envelope = { from: null, to: [] };
    let dataLines = [];

    socket.on("data", async (chunk) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === ".") {
            inData = false;
            messages.push({ from: envelope.from, to: envelope.to.slice(), raw: dataLines.join("\n") });
            dataLines = [];
            envelope = { from: null, to: [] };
            socket.write("250 2.0.0 Ok: queued\r\n");
          } else {
            // Undo SMTP dot-stuffing.
            dataLines.push(line.startsWith("..") ? line.slice(1) : line);
          }
          continue;
        }

        const [verbRaw, ...rest] = line.split(" ");
        const verb = verbRaw.toUpperCase();
        const arg = rest.join(" ");

        if (verb === "EHLO" || verb === "HELO") {
          socket.write(requireAuth ? "250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10485760\r\n" : "250 localhost\r\n");
        } else if (verb === "AUTH") {
          credentials.push(arg.replace(/[^\x20-\x7e]/g, ""));
          socket.write("235 2.7.0 Authentication successful\r\n");
        } else if (verb === "MAIL") {
          envelope.from = (arg.match(/<([^>]*)>/) || [])[1] || null;
          socket.write("250 2.1.0 Ok\r\n");
        } else if (verb === "RCPT") {
          envelope.to.push((arg.match(/<([^>]*)>/) || [])[1] || null);
          socket.write("250 2.1.5 Ok\r\n");
        } else if (verb === "DATA") {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (verb === "QUIT") {
          socket.write("221 2.0.0 Bye\r\n");
          socket.end();
        } else if (verb === "RSET") {
          envelope = { from: null, to: [] };
          socket.write("250 2.0.0 Ok\r\n");
        } else {
          socket.write("250 2.0.0 Ok\r\n");
        }
      }
    });
    socket.on("error", () => {});
  });

  return {
    messages,
    credentials,
    listen: () => new Promise((resolve) => server.listen(port, "127.0.0.1", resolve)),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

module.exports = { createSmtpSink };
