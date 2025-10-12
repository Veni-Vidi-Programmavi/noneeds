var fs = require("fs");
var chalk = require("chalk");
class f{
    static log(value) {
        fs.appendFileSync(path.join(os.homedir(), "logs.txt"), chalk.gray("LOG =>    ")+value+"\n");
        console.log(value);
    };
};

module.exports = f;