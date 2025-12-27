# Deployment Guide

Complete guide for deploying Repset Socket Server v3.0 to production.

---

## Pre-Deployment Checklist

- [ ] Environment variables configured
- [ ] ADMIN_SECRET is strong and secure
- [ ] WEBHOOK_URL is accessible from server
- [ ] SSL/TLS certificates ready (for WSS)
- [ ] Firewall rules configured
- [ ] Monitoring tools set up
- [ ] Backup strategy defined

---

## Platform-Specific Guides

### Render.com (Recommended)

**Pros**: Easy WebSocket support, auto-deploy from Git, free tier available

1. **Create New Web Service**
   - Connect your GitHub/GitLab repository
   - Select "Node" environment

2. **Configure Build Settings**
   ```
   Build Command: npm install
   Start Command: npm start
   ```

3. **Set Environment Variables**
   ```
   PORT=3001
   ADMIN_SECRET=<generate-strong-secret>
   WEBHOOK_URL=https://your-app.com/api/webhooks/biometric-events
   BIOMETRIC_WEBHOOK_SECRET=<your-webhook-secret>
   ```

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Note your service URL: `https://your-app.onrender.com`

5. **Configure Health Checks**
   - Path: `/`
   - Expected response: `200 OK`

**Cost**: Free tier available, paid plans start at $7/month

---

### Railway.app

**Pros**: Simple deployment, automatic HTTPS, generous free tier

1. **Create New Project**
   ```bash
   npm install -g @railway/cli
   railway login
   railway init
   ```

2. **Configure Environment**
   ```bash
   railway variables set ADMIN_SECRET=<your-secret>
   railway variables set WEBHOOK_URL=<your-webhook-url>
   railway variables set BIOMETRIC_WEBHOOK_SECRET=<your-secret>
   ```

3. **Deploy**
   ```bash
   railway up
   ```

4. **Get Public URL**
   ```bash
   railway domain
   ```

**Cost**: $5/month credit on free tier, pay-as-you-go after

---

### Heroku

**Pros**: Mature platform, extensive documentation

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   heroku login
   ```

2. **Create App**
   ```bash
   heroku create your-app-name
   ```

3. **Set Environment Variables**
   ```bash
   heroku config:set ADMIN_SECRET=<your-secret>
   heroku config:set WEBHOOK_URL=<your-webhook-url>
   heroku config:set BIOMETRIC_WEBHOOK_SECRET=<your-secret>
   ```

4. **Deploy**
   ```bash
   git push heroku main
   ```

5. **Scale Dynos**
   ```bash
   heroku ps:scale web=1
   ```

**Cost**: $7/month for basic dyno

---

### AWS (EC2 + Load Balancer)

**Pros**: Full control, scalable, enterprise-ready

#### 1. Launch EC2 Instance

```bash
# Amazon Linux 2
sudo yum update -y
sudo yum install -y nodejs npm git

# Clone repository
git clone <your-repo-url>
cd repset-socket-server
npm install --production
```

#### 2. Configure Environment

```bash
sudo nano /etc/environment
# Add:
ADMIN_SECRET=<your-secret>
WEBHOOK_URL=<your-webhook-url>
BIOMETRIC_WEBHOOK_SECRET=<your-secret>
```

#### 3. Set Up PM2 (Process Manager)

```bash
sudo npm install -g pm2
pm2 start server.js --name repset-socket
pm2 startup
pm2 save
```

#### 4. Configure Security Group

- Inbound Rules:
  - Port 3001 (or your PORT) - Custom TCP
  - Port 443 - HTTPS (if using SSL)
  - Port 80 - HTTP (for redirect)

#### 5. Set Up Application Load Balancer

- Create Target Group (port 3001)
- Create ALB with HTTPS listener
- Configure SSL certificate (AWS Certificate Manager)
- Enable WebSocket support (sticky sessions)

#### 6. Configure Health Checks

- Path: `/`
- Interval: 30 seconds
- Timeout: 5 seconds
- Healthy threshold: 2

**Cost**: ~$10-50/month depending on instance size

---

### Docker Deployment

#### 1. Build Image

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy application
COPY . .

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "server.js"]
```

#### 2. Build and Run

```bash
# Build
docker build -t repset-socket-server:3.0.0 .

# Run
docker run -d \
  --name repset-socket \
  -p 3001:3001 \
  -e ADMIN_SECRET=<your-secret> \
  -e WEBHOOK_URL=<your-webhook-url> \
  -e BIOMETRIC_WEBHOOK_SECRET=<your-secret> \
  --restart unless-stopped \
  repset-socket-server:3.0.0
```

#### 3. Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  socket-server:
    build: .
    ports:
      - "3001:3001"
    environment:
      - ADMIN_SECRET=${ADMIN_SECRET}
      - WEBHOOK_URL=${WEBHOOK_URL}
      - BIOMETRIC_WEBHOOK_SECRET=${BIOMETRIC_WEBHOOK_SECRET}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3001/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 5s
      retries: 3
```

```bash
docker-compose up -d
```

---

### Kubernetes

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: repset-socket-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: repset-socket
  template:
    metadata:
      labels:
        app: repset-socket
    spec:
      containers:
      - name: socket-server
        image: your-registry/repset-socket-server:3.0.0
        ports:
        - containerPort: 3001
        env:
        - name: ADMIN_SECRET
          valueFrom:
            secretKeyRef:
              name: repset-secrets
              key: admin-secret
        - name: WEBHOOK_URL
          valueFrom:
            configMapKeyRef:
              name: repset-config
              key: webhook-url
        - name: BIOMETRIC_WEBHOOK_SECRET
          valueFrom:
            secretKeyRef:
              name: repset-secrets
              key: webhook-secret
        livenessProbe:
          httpGet:
            path: /
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: repset-socket-service
spec:
  type: LoadBalancer
  ports:
  - port: 443
    targetPort: 3001
    protocol: TCP
  selector:
    app: repset-socket
```

---

## SSL/TLS Configuration

### Using Nginx as Reverse Proxy

```nginx
# /etc/nginx/sites-available/repset-socket

upstream socket_server {
    server localhost:3001;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # WebSocket support
    location / {
        proxy_pass http://socket_server;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for WebSocket
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
}
```

### Let's Encrypt SSL

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

---

## Monitoring & Logging

### PM2 Monitoring

```bash
# View logs
pm2 logs repset-socket

# Monitor resources
pm2 monit

# Web dashboard
pm2 plus
```

### CloudWatch (AWS)

```bash
# Install CloudWatch agent
sudo yum install amazon-cloudwatch-agent

# Configure log streaming
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/config.json
```

### Custom Monitoring Script

```javascript
// monitor.js
import { io } from "socket.io-client";

const socket = io("https://your-server.com", {
  auth: {
    gymId: "monitor",
    secret: process.env.ADMIN_SECRET,
    type: "ADMIN"
  }
});

socket.on("connect", () => {
  console.log("✅ Server is online");
  // Send alert to monitoring service
});

socket.on("disconnect", () => {
  console.error("❌ Server is offline");
  // Send alert to monitoring service
});

setInterval(() => {
  socket.emit("cloud-command", {
    action: "GET_DEVICE_STATUS",
    commandId: `monitor_${Date.now()}`
  });
}, 60000); // Check every minute
```

---

## Performance Optimization

### 1. Enable Compression

```javascript
// Add to server.js
import compression from 'compression';
app.use(compression());
```

### 2. Connection Pooling

Already implemented via Socket.IO's built-in connection management.

### 3. Redis Adapter (for scaling)

```bash
npm install @socket.io/redis-adapter redis
```

```javascript
// Add to server.js
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const pubClient = createClient({ url: "redis://localhost:6379" });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

### 4. Load Balancing

Use sticky sessions to ensure clients connect to the same server:

```nginx
upstream socket_servers {
    ip_hash;  # Sticky sessions
    server server1:3001;
    server server2:3001;
    server server3:3001;
}
```

---

## Security Hardening

### 1. Rate Limiting

```bash
npm install express-rate-limit
```

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
```

### 2. Helmet (Security Headers)

```bash
npm install helmet
```

```javascript
import helmet from 'helmet';
app.use(helmet());
```

### 3. IP Whitelisting

```javascript
const ALLOWED_IPS = process.env.ALLOWED_IPS?.split(',') || [];

io.use((socket, next) => {
  const clientIP = socket.handshake.address;
  if (ALLOWED_IPS.length > 0 && !ALLOWED_IPS.includes(clientIP)) {
    return next(new Error('IP not allowed'));
  }
  next();
});
```

---

## Backup & Disaster Recovery

### 1. Configuration Backup

```bash
# Backup environment variables
cp .env .env.backup

# Store in secure location (e.g., AWS Secrets Manager)
aws secretsmanager create-secret \
  --name repset-socket-config \
  --secret-string file://.env
```

### 2. Automated Backups

```bash
# Cron job for daily backups
0 2 * * * /usr/local/bin/backup-script.sh
```

### 3. Disaster Recovery Plan

1. Keep infrastructure as code (Terraform/CloudFormation)
2. Document all environment variables
3. Maintain deployment runbook
4. Test recovery process quarterly
5. Keep multiple region deployments

---

## Troubleshooting

### Server Won't Start

```bash
# Check logs
pm2 logs repset-socket

# Check port availability
netstat -tuln | grep 3001

# Verify environment variables
printenv | grep ADMIN_SECRET
```

### WebSocket Connection Fails

```bash
# Test HTTP endpoint
curl https://your-server.com/

# Test WebSocket (using wscat)
npm install -g wscat
wscat -c wss://your-server.com
```

### High Memory Usage

```bash
# Check process memory
pm2 show repset-socket

# Restart if needed
pm2 restart repset-socket
```

---

## Cost Estimates

| Platform | Monthly Cost | Suitable For |
|----------|-------------|--------------|
| Render (Free) | $0 | Development/Testing |
| Render (Starter) | $7 | Small gyms (1-5) |
| Railway | $5-20 | Small to medium (5-20 gyms) |
| Heroku | $7-25 | Small to medium |
| AWS EC2 (t3.small) | $15-30 | Medium (20-50 gyms) |
| AWS EC2 (t3.medium) | $30-60 | Large (50-200 gyms) |
| Kubernetes | $100+ | Enterprise (200+ gyms) |

---

## Support

For deployment issues:
1. Check server logs
2. Verify environment variables
3. Test health endpoint
4. Review firewall rules
5. Contact support with logs

---

**Last Updated**: December 2025  
**Version**: 3.0.0
