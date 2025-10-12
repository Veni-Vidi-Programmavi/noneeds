var fs = require("fs");
var chalk = require("chalk");
var os = require("os");

class f{
    static log(value) {
        fs.appendFileSync(path.join(os.homedir(), ".noneed/logs.txt"), chalk.gray("LOG =>    ")+value+"\n");
        console.log(value);
    };
};

module.exports = f;