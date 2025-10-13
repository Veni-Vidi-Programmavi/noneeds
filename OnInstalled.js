var readline = require("readline");
var { exec } = require("child_process");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("[39m[32m[1m✅ Noneed is good installed[22m[39m");
rl.question("[39m[90m=> You can type Enter to run NoNeed ...[39m", () => {
    const child = spawn("noneed", {
        detached: true, 
        stdio: "ignore"
    });
    child.unref();
    process.exit(0);
});