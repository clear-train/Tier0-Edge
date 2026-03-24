# --- 修正后的 Mac 兼容版本 ---

# 1. 确保目录存在并拷贝内容
mkdir -p "$VOLUMES_PATH"
cp -r "$SCRIPT_DIR/../mount/"* "$VOLUMES_PATH"

# 2. 修复 chown 参数顺序 (把 -R 挪到前面)
# 使用 sudo 以确保在 macOS 挂载卷上生效
sudo chown -R 999:0 "$VOLUMES_PATH/postgresql"
sudo chmod 644 "$VOLUMES_PATH/postgresql/conf/"*.conf
sudo chown -R 1000:1000 "$VOLUMES_PATH/emqx"
sudo chown -R 1000:0 "$VOLUMES_PATH/keycloak"
sudo chown -R 755:0 "$VOLUMES_PATH/grafana" 

# 3. 处理系统配置
mkdir -p "$VOLUMES_PATH/edge/system/"
cp "$SCRIPT_DIR/../docker-compose.yml" "$VOLUMES_PATH/edge/system/"

if [ -f "$SCRIPT_DIR/global/active-services.txt" ]; then
  mv "$SCRIPT_DIR/global/active-services.txt" "$VOLUMES_PATH/edge/system/"
fi

# 4. 确保脚本可执行
find "$VOLUMES_PATH" -name "*.sh" -exec chmod +x {} \;

info "success to create folder: $VOLUMES_PATH"