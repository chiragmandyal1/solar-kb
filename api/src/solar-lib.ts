// The RAG pipeline is plain ESM in ../lib; Node 24 can require() it directly.
/* eslint-disable @typescript-eslint/no-require-imports */
import { join } from "node:path";

export const libDir = join(__dirname, "../../lib");
export const { connect } = require(join(libDir, "db.mjs"));
export const { answerQuestion } = require(join(libDir, "answer.mjs"));
