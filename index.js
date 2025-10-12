var f = require("./usefool.js");
var infos = require("./parser.js");
var pwa = require("./pwa/pwa.js");
var chalk = require("chalk");
var fs = require("fs");
const PWA = require("./pwa/pwa.js");

switch (infos.entry) {
    case "pwa":
        var pwa = new PWA();
        pwa.askUser().then(()=> {
            pwa.genManifest();
        });
        break;
    case "log":
        var logs = fs.readFileSync("logs.txt", "utf-8").split("\n");
        console.log(chalk.blue.bold("Affichage des logs :\n"));
        logs.forEach(element => {
            console.log(element);
        });
        break;
    case "reset_log":
        fs.writeFileSync("logs.txt", "");
        if (fs.readFileSync("logs.txt", "utf-8") === "") {
            f.log(chalk.green.bold("✅ Logs are good reseted"));
        } else {
            f.log(chalk.red.bold("ERREUR: Logs are NOT good RESETED \n.  Make sur you didn't remove any file of this CLI"));
        };
        break;
    case "list":
        var l = fs.readdirSync("pwa/");
        console.log(l)
        
        break;
}
