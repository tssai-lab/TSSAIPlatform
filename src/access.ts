/**
 * @see https://umijs.org/docs/max/access#access
 * */
export default function access(
  initialState: { currentUser?: API.CurrentUser } | undefined,
) {
  const { currentUser } = initialState ?? {};
  return {
    // 判断是否为管理员
    canAdmin: currentUser?.access === 'admin' || currentUser?.role === 'admin',
  };
}
