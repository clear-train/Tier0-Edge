# --- 修正后的 Mac 兼容版本 ---

# 1. 确保目录存在并拷贝内容
# --- 这是你修改后的 init-volumes.sh 权限部分 ---

mkdir -p "$VOLUMES_PATH" && cp -r "$SCRIPT_DIR/../mount/"* "$VOLUMES_PATH"

if sudo -n true 2>/dev/null; then
  # 把原来的 999、1000 全部改成 $(whoami)
  sudo chown -R $(whoami) "$VOLUMES_PATH/postgresql"
  sudo chmod 644 "$VOLUMES_PATH/postgresql/conf/"*.conf

  sudo chown -R $(whoami) "$VOLUMES_PATH/emqx"
  sudo chown -R $(whoami) "$VOLUMES_PATH/keycloak"
  sudo chown -R $(whoami) "$VOLUMES_PATH/grafana"
else
  warn "Skipping ownership updates because sudo requires a password in this shell."
fi
# 3. 处理系统配置
mkdir -p "$VOLUMES_PATH/edge/system/"
cp "$SCRIPT_DIR/../docker-compose.yml" "$VOLUMES_PATH/edge/system/"

if [ -f "$SCRIPT_DIR/global/active-services.txt" ]; then
  mv "$SCRIPT_DIR/global/active-services.txt" "$VOLUMES_PATH/edge/system/"
fi

# 4. 确保脚本可执行
find "$VOLUMES_PATH" -name "*.sh" -exec chmod +x {} \;

info "success to create folder: $VOLUMES_PATH"
