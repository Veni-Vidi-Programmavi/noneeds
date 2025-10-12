var inquirer = require("inquirer");
const f = require("../usefool");
var chalk = require("chalk");
var fs = require("fs");

var questions = [
    {
        type: 'input',
        name: 'appName',
        message: '>> Your PWA\'s name',
        default: 'MyApp',
    },
    {
        type: 'input',
        name: 'appOwner',
        message: '>> Your PWA\'s author',
        default: 'Myself',
    },
    {
        type: 'input',
        name: 'appColor',
        message: '>> Your PWA\'s color',
        default: '#007bff',
        validate: input => {if (!input.startsWith("#")) return "Please, put an valid HEC"; else return true;}
    }
];

class PWA {
    constructor() {
        this.name = "MyApp";
        this.author = "MySelf";
        this.color = "MySelf";
    }
    mkdir(name) {
        f.log(chalk.gray("=> Making a folder..."));
        fs.mkdirSync(`pwa/${name}`, {recursive: true});
    }
    async askUser() {
        var a = await inquirer.prompt(questions);
        this.name = a.appName;
        this.author = a.appOwner;
        this.color = a.appColor;

        this.mkdir(a.appName);
    }
    genManifest() {
        var fi;
        f.log(chalk.gray("=> Generating the manifest..."));
        if (!fs.existsSync(`pwa/${this.name}/manifest.json`)) {
            fi = JSON.parse(fs.readFileSync(`pwa/manifest.json`, "utf-8"));
        } else {
            fi = JSON.parse(fs.readFileSync(`pwa/${this.name}/manifest.json`, "utf-8"));
        };
        fi["name"] = this.name;
        fi["short_name"] = this.name;
        fi["theme_color"] = this.color;
        fs.writeFileSync(`pwa/${this.name}/manifest.json`, JSON.stringify(fi, null, 2));
        f.log(chalk.green.bold("✅ Manifest updated"));
    }
};

module.exports = PWA;