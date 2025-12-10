import fs from 'fs';
import pathToDb from '../../knexfile';
import db from '../../db';
import log from "electron-log";

export function initializeSqliteDatabase() {
    fs.exists(pathToDb.connection.filename, async (exists) => {
        try {
            await db.migrate.latest();
            if (!exists) {
                log.log("Database created and migrations run successfully");
            } else {
                log.log("Migrations run successfully");
            }
        } catch (error) {
            log.error("Failed to create database and run migrations", error);
        }
    });
};