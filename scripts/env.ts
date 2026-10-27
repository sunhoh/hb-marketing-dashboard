/** 스크립트용 .env.local 읽기. 다른 import 보다 먼저 불러야 한다(Next 는 스스로 읽음) */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
