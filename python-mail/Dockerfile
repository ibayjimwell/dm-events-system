FROM python:3.12-slim
WORKDIR /app
COPY server.py ./server.py
RUN useradd -r -u 10001 appuser
USER appuser
EXPOSE 8765
CMD ["python", "-u", "server.py"]
