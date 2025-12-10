
import { app } from 'electron';
import path from 'path';
import { isProd, getUserDataPath } from './main/lib/app-config';

let sqliteName = ''
function pathToDb() {
    if (isProd) {
      sqliteName = 'prod.sqlite3'
    } else {
      sqliteName = 'dev.sqlite3'
    }
    console.log("DEV: ", getUserDataPath() + '/' + sqliteName)
}
pathToDb()
const config = {
    client: 'sqlite3',
    connection: {
      filename: getUserDataPath() + '/' + sqliteName,
    },
    migrations: {
      directory: path.join(app.getAppPath(), 'migrations')
    },
    useNullAsDefault: true,
};
export default config;