#!/bin/bash

docker rm piper-dev && docker run --name piper-dev -it -v $(pwd):/usr/src/app -p 53098:3000 piper-dev