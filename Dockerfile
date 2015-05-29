FROM ubuntu:14.04
RUN apt-get update && apt-get install -y node npm
RUN apt-get update && apt-get install -y libcairo2-dev libjpeg8-dev libpango1.0-dev libgif-dev build-essential g++
RUN npm cache clean -f
RUN npm install -g n
RUN n stable
RUN mkdir -p /var/app
ENV PATH /var/app/node_modules/.bin:$PATH
WORKDIR /var/app
ADD package.json /var/app/package.json
RUN npm install
RUN mkdir -p /var/app/icons/awesome && font-blast node_modules/font-awesome/fonts/fontawesome-webfont.svg icons/awesome
ADD . /var/app

ENV INFOSITE http://shields.io
CMD npm run start
