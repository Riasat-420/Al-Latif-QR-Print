import paramiko

SSH_HOST = "145.79.25.183"
SSH_PORT = 65002
SSH_USER = "u514821150"
SSH_PASS = "2@AwK@Js5:wnH*3e"

def setup_pm2():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(SSH_HOST, port=SSH_PORT, username=SSH_USER, password=SSH_PASS, timeout=15)
    
    # 1. Install pm2 locally in user space
    # 2. Start server with PM2
    # 3. Save PM2 startup list
    commands = [
        "npm install -g pm2 --prefix ~/.npm-global || npm install pm2",
        "export PATH=$HOME/.npm-global/bin:$PATH; which pm2 || ./node_modules/.bin/pm2 -v",
        "cd /home/u514821150/domains/print.allatifsofts.com/public_html && npx pm2 start backend/src/server.js --name 'qr-print' || npx pm2 restart 'qr-print'",
        "npx pm2 list",
        "curl -I http://127.0.0.1:3000/health",
    ]
    
    for cmd in commands:
        print(f"\n>>> [RUNNING]: {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd)
        out = stdout.read().decode('utf-8', errors='ignore')
        err = stderr.read().decode('utf-8', errors='ignore')
        if out:
            print("[STDOUT]:\n" + out.strip())
        if err:
            print("[STDERR]:\n" + err.strip())
            
    client.close()

if __name__ == "__main__":
    setup_pm2()
