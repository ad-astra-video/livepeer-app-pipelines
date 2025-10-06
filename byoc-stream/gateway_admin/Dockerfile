# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
