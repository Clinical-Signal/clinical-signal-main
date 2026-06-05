import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/lib/env";

export function createSmtpTransport(): Transporter {
  return nodemailer.createTransport({
    host: env.SMTP_SERVER,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  });
}
