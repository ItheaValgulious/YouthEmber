
# Most important:

AI返回数据接收

# Others

- Event Flow 改造：
  - 把当前“只增不减”的批次加载改成更合理的动态加载方式
  - 保留时间轴、日期跳转、关键词搜索和 tag 交集筛选
- Location filter 修复：
  - 打开 filter modal 时，确保 location 级联筛选能正确用当前位置初始化
  - 拿不到位置时稳定回退为空态，不阻塞筛选
- 移动端定位链路修复：
  - 修复当前“移动端实际拿不到位置”的问题
  - 不要因为错误的权限判断把定位流程卡死
  - create / filter 两处位置能力都要一起核对
- 导入导出版本号调整：
  - 保留当前 JSON bundle 的额外打包结构
  - 把 `schema_version` 从当前实现的 `2` 调整回 `1`
  - 导入逻辑继续兼容历史包
