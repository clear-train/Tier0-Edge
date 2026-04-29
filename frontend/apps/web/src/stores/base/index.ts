import { type UseBoundStoreWithEqualityFn, createWithEqualityFn } from 'zustand/traditional';
import type { StoreApi } from 'zustand';
import { shallow } from 'zustand/vanilla/shallow';
import type { DataItem, ResourceProps, UserInfoProps } from '@/stores/types.ts';
import { storageOpt } from '@/utils/storage';
import { APP_TITLE, SUPOS_LANG, SUPOS_UNS_TREE, SUPOS_USER_TIPS_ENABLE } from '@/common-types/constans.ts';
import { getPersonConfigApi } from '@/apis/inter-api/uns.ts';
import { getSystemConfig } from '@/apis/inter-api/system-config.ts';
import { getUserInfo } from '@/apis/inter-api/auth';

import type { TBaseStore } from '@/stores/base/type.ts';
import { initI18n, defaultLanguage, I18nEnum, useI18nStore } from '../i18n-store.ts';
import { getRoutesResourceApi } from '@/apis/inter-api/resource.ts';
import {
  type Criteria,
  filterArrays,
  filterContainerList,
  filterObjectArrays,
  guideConfig,
  handleButtonPermissions,
  multiGroupByCondition,
  buildResourceTrees,
  filterRouteByUserResource,
  mapResource,
} from '../utils.ts';
import { getLangListApi } from '@/apis/inter-api/i18n.ts';

const buildMarketplaceMenu = (lang?: string): ResourceProps => {
  const currentLang = lang || useI18nStore.getState().lang || storageOpt.getOrigin(SUPOS_LANG) || defaultLanguage;
  const isEnglish = currentLang === I18nEnum.EnUS;

  return {
    id: 'frontend-app-marketplace',
    type: 2,
    icon: 'menu.tag.apps',
    code: 'app-marketplace',
    showName: isEnglish ? 'App Marketplace' : '应用市场',
    showDescription: isEnglish
      ? 'Deploy and manage edge applications such as OpenEMS'
      : '部署和管理 OpenEMS 等边缘应用',
    sort: 999,
    url: '/app-marketplace',
    urlType: 1,
    openType: 0,
    enable: true,
    homeEnable: true,
    isFrontend: true,
  };
};

const DEV_LOCAL_SYSTEM_INFO = {
  appTitle: APP_TITLE,
  authEnable: false,
  lang: storageOpt.getOrigin(SUPOS_LANG) || defaultLanguage,
};

const DEV_LOCAL_USER_INFO = {
  preferredUsername: 'local-dev',
  sub: 'local-dev',
  homePage: '/app-marketplace',
  superAdmin: true,
  roleList: [],
  roleString: '',
  buttonList: [],
  pageList: [{ policyId: 'local', resourceId: 'frontend-app-marketplace', url: '/app-marketplace' }],
};

const mergeBuiltinMenus = (
  menuTree: ResourceProps[] = [],
  menuGroup: ResourceProps[] = [],
  homeTree: ResourceProps[] = [],
  homeGroup: ResourceProps[] = [],
  lang?: string
) => {
  const appMarketplaceMenu = buildMarketplaceMenu(lang);
  const exists = menuGroup.some(
    (item) => item.code?.toLowerCase?.() === appMarketplaceMenu.code || item.url === appMarketplaceMenu.url
  );
  if (exists) {
    return { menuTree, menuGroup, homeTree, homeGroup };
  }
  const mergedMenuGroup = [...menuGroup, appMarketplaceMenu];
  const mergedMenuTree = [...menuTree, appMarketplaceMenu].sort((a, b) => a.sort - b.sort);
  const mergedHomeGroup = [...homeGroup, appMarketplaceMenu];
  const mergedHomeTree = [...homeTree, appMarketplaceMenu].sort((a, b) => a.sort - b.sort);
  return {
    menuTree: mergedMenuTree,
    menuGroup: mergedMenuGroup,
    homeTree: mergedHomeTree,
    homeGroup: mergedHomeGroup,
  };
};

const applyDevLocalFallback = async () => {
  const lang = storageOpt.getOrigin(SUPOS_LANG) || defaultLanguage;
  const mergedMenus = mergeBuiltinMenus([], [], [], [], lang);
  useBaseStore.setState({
    ...initBaseContent,
    homeGroup: mergedMenus.homeGroup,
    homeTree: mergedMenus.homeTree,
    menuGroup: mergedMenus.menuGroup,
    menuTree: mergedMenus.menuTree,
    currentUserInfo: DEV_LOCAL_USER_INFO as UserInfoProps,
    systemInfo: {
      ...DEV_LOCAL_SYSTEM_INFO,
      lang,
    },
  });
  return initI18n(lang);
};

/**
 * 获取语言包
 */
export const getLangList = async () => {
  try {
    const langList = await getLangListApi();
    useI18nStore.setState({
      langList: langList,
    });
    return langList;
  } catch (e) {
    console.log(e);
    const langList = [
      {
        hasUsed: true,
        id: 1,
        languageCode: 'zh-CN',
        languageName: '中文（简体）',
        languageType: 1,
        label: '中文（简体）',
        value: 'zh-CN',
      },
      {
        hasUsed: true,
        id: 2,
        languageCode: 'en-US',
        languageName: 'English',
        languageType: 1,
        label: 'English',
        value: 'en-US',
      },
    ];
    useI18nStore.setState({
      langList: langList,
    });
    return langList;
  }
};
/**
 * @description: 系统基础store 路由、用户信息、系统信息、当前菜单信息等
 *
 * currentUserInfo: 用户相关信息，包含：用户角色，用户存在的操作权限buttonList,拒绝优先操作资源组denyButtonGroup，操作资源组buttonGroup 等；
 * 导航路由信息-根据权限显示：menuTree, menuGroup
 * home页路由信息-根据权限显示：homeTree, homeGroup
 * home页Tab: homeTabGroup（暂未控制权限）
 * 原始菜单组（导航的不控制权限 含父级目录）: originMenu
 * 所有按钮组（不控制权限）: allButtonGroup
 * **/
export const initBaseContent = {
  originMenu: [],
  menuTree: [],
  homeTree: [],
  menuGroup: [],
  homeGroup: [],
  homeTabGroup: [],
  allButtonGroup: [],
  currentUserInfo: {},
  systemInfo: { appTitle: '' },
  dataBaseType: [],
  dashboardType: [],
  userTipsEnable: storageOpt.getOrigin(SUPOS_USER_TIPS_ENABLE) || '',
  pluginList: [],
  buttonList: [],
  loading: true,
};

export const useBaseStore: UseBoundStoreWithEqualityFn<StoreApi<TBaseStore>> = createWithEqualityFn(
  () => initBaseContent,
  shallow
);

// 设置用户tipsEnable
export const setUserTipsEnable = (value: string) => {
  storageOpt.setOrigin(SUPOS_USER_TIPS_ENABLE, value);
  useBaseStore.setState({
    userTipsEnable: value,
  });
};

const criteria: Criteria<DataItem> = {
  buttonGroup: (item: any) => item?.uri?.includes('button:'),
};

// edge版本 用户默认支持所有的权限和菜单
// 更新路由基础方法 (私有)
const updateBaseStore = async (isFirst: boolean = false) => {
  if (isFirst) {
    try {
      // 首次需要同时拿到用户信息的url和路由
      const [{ value: resource, reason }, { value: info }, { value: systemInfo }]: any = await Promise.allSettled([
        getRoutesResourceApi(),
        getUserInfo(),
        getSystemConfig(),
      ]);

      // 国际化语言包list
      await getLangList();

      const _lang = await fetchUserLanguage({
        userId: info?.sub,
        lang: systemInfo?.lang,
      });

      // 通过用户的资源池  拿到 - 菜单资源 和 操作资源
      const { buttonGroup, others } = multiGroupByCondition(info?.resourceList, criteria);
      // 拿到 拒绝优先的 菜单资源、 操作资源
      const { buttonGroup: denyButtonGroup, others: denyOthers } = multiGroupByCondition(
        info?.denyResourceList,
        criteria
      );
      // 整合出用户路由资源组
      const userRoutesResourceList = filterObjectArrays(denyOthers, others);
      // 过滤后的路由组,含home\home_tab\menu及目录 去除操作权限
      const allRoutes = filterRouteByUserResource(
        mapResource(resource?.filter((r: ResourceProps) => r.type !== 3)),
        userRoutesResourceList,
        systemInfo?.authEnable && !info?.superAdmin
      );
      // 剔除未启用的路由
      const enableRoutes = allRoutes?.filter((f) => f.enable);
      // 获取终极菜单
      const { homeTree, homeTabGroup, homeGroup, menuGroup, menuTree } = buildResourceTrees(enableRoutes);
      const mergedMenus = mergeBuiltinMenus(menuTree, menuGroup, homeTree, homeGroup, _lang);
      const allButtonGroup = resource?.filter((r: ResourceProps) => r.type === 3);
      const _buttonList =
        systemInfo?.authEnable === false || info?.superAdmin === true
          ? handleButtonPermissions(['button:*'], allButtonGroup) || []
          : filterArrays(
              handleButtonPermissions(denyButtonGroup?.map((i: any) => i.uri) || [], allButtonGroup) || [],
              handleButtonPermissions(buttonGroup?.map((i: any) => i.uri) || [], allButtonGroup) || []
            ) || [];
      // 储存用户信息
      storageOpt.set('personInfo', {
        username: info?.preferredUsername,
      });
      const containerList = filterContainerList(systemInfo?.containerMap || {});
      // 个人用户设置
      const currentUserInfo = {
        ...info,
        roleList: info?.roleList || [],
        roleString: info?.roleList?.map((i: any) => i.roleName)?.join('/') || '',
        buttonList: buttonGroup?.map((i: any) => i.uri) || [],
        pageList: userRoutesResourceList || [],
        superAdmin: info?.superAdmin,
        denyButtonGroup,
        buttonGroup,
      };
      useBaseStore.setState({
        ...initBaseContent,
        homeTree: mergedMenus.homeTree,
        homeTabGroup,
        homeGroup: mergedMenus.homeGroup,
        menuGroup: mergedMenus.menuGroup,
        menuTree: mergedMenus.menuTree,
        originMenu: resource,
        allButtonGroup,
        // pluginList,
        routesStatus: reason?.status,
        currentUserInfo,
        systemInfo: {
          ...(systemInfo ?? {}),
          appTitle: systemInfo?.appTitle || APP_TITLE,
        },
        containerList,
        buttonList: _buttonList,
        dataBaseType: systemInfo?.containerMap?.tdengine?.envMap?.service_is_show ? ['tdengine'] : ['timescale'],
        mqttBrokeType: systemInfo?.containerMap?.emqx?.name,
        dashboardType:
          containerList.aboutUs
            ?.filter((i) => ['fuxa', 'grafana'].includes(i.name) && i.envMap?.service_is_show)
            ?.map((m) => m.name) ?? [],
      });
      // 设置新手引导
      guideConfig({ systemInfo, menuGroup: mergedMenus.menuGroup, info });

      // 设置unsTree信息
      const unsTreeInfo = storageOpt.get(SUPOS_UNS_TREE);
      if (unsTreeInfo) {
        storageOpt.set(SUPOS_UNS_TREE, { ...unsTreeInfo, state: { lazyTree: systemInfo?.lazyTree } });
      } else {
        storageOpt.set(SUPOS_UNS_TREE, { state: { lazyTree: systemInfo?.lazyTree }, version: 0 });
      }
      // 首次需要初始化语言包
      return await initI18n(_lang);
    } catch (_) {
      console.log(_);
      if (import.meta.env.DEV) {
        return applyDevLocalFallback();
      }
      // 首次需要初始化语言包
      return await initI18n(storageOpt.getOrigin(SUPOS_LANG) || defaultLanguage);
    }
  } else {
    const baseState = useBaseStore.getState();
    // 重新获取菜单
    return getRoutesResourceApi()
      .then((resource: ResourceProps[]) => {
        const allRoutes = filterRouteByUserResource(
          mapResource(resource.filter((r: ResourceProps) => r.type !== 3)),
          baseState?.currentUserInfo?.pageList,
          baseState.systemInfo?.authEnable && !baseState.currentUserInfo?.superAdmin
        );
        const enableRoutes = allRoutes?.filter((f) => f.enable);
        const { homeTree, homeTabGroup, homeGroup, menuGroup, menuTree } = buildResourceTrees(enableRoutes);
        const mergedMenus = mergeBuiltinMenus(
          menuTree,
          menuGroup,
          homeTree,
          homeGroup,
          useI18nStore.getState().lang || storageOpt.getOrigin(SUPOS_LANG) || defaultLanguage
        );
        const allButtonGroup = resource?.filter((r: ResourceProps) => r.type === 3);
        const _buttonList =
          baseState?.systemInfo?.authEnable === false || baseState?.currentUserInfo?.superAdmin === true
            ? handleButtonPermissions(['button:*'], allButtonGroup) || []
            : filterArrays(
                handleButtonPermissions(
                  baseState?.currentUserInfo?.denyButtonGroup?.map((i: any) => i.uri) || [],
                  allButtonGroup
                ) || [],
                handleButtonPermissions(
                  baseState?.currentUserInfo?.buttonGroup?.map((i: any) => i.uri) || [],
                  allButtonGroup
                ) || []
              ) || [];
        useBaseStore.setState({
          homeTree: mergedMenus.homeTree,
          homeTabGroup,
          homeGroup: mergedMenus.homeGroup,
          menuGroup: mergedMenus.menuGroup,
          menuTree: mergedMenus.menuTree,
          originMenu: resource,
          allButtonGroup,
          buttonList: _buttonList,
        });
        return allRoutes;
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.log(error);
          return applyDevLocalFallback();
        }
        return Promise.reject(error);
      });
  }
};

// 初始化获取baseStore
export const fetchBaseStore = async (isFirst: boolean = false): Promise<any> => {
  return updateBaseStore(isFirst).finally(() => {
    useBaseStore.setState({
      loading: false,
    });
  });
};

// 设置当前菜单信息
export const setCurrentMenuInfo = (data: ResourceProps) => {
  useBaseStore.setState({
    currentMenuInfo: data,
  });
};

// 手动更新用户信息
export const updateForUserInfo = (info: UserInfoProps) => {
  useBaseStore.setState({
    currentUserInfo: {
      ...useBaseStore.getState().currentUserInfo,
      ...info,
    },
  });
};

export const setPluginList = (pluginList: any[]) => {
  useBaseStore.setState({
    pluginList,
  });
};

const fetchUserLanguage = async (info: { userId?: string; lang?: string }) => {
  const { lang, userId } = info;
  try {
    if (!userId) {
      return import.meta.env.REACT_APP_LOCAL_LANG || lang || storageOpt.getOrigin(SUPOS_LANG) || defaultLanguage;
    } else {
      const response = await getPersonConfigApi(userId);
      return import.meta.env.REACT_APP_LOCAL_LANG || response.mainLanguage;
    }
  } catch (error) {
    console.error('配置请求失败', error);
    return import.meta.env.REACT_APP_LOCAL_LANG || lang || storageOpt.getOrigin(SUPOS_LANG) || defaultLanguage;
  }
};

export const fetchSystemInfo = async (fetchRoute?: boolean): Promise<any> => {
  await getSystemConfig().then((systemInfo) => {
    const containerList = filterContainerList(systemInfo?.containerMap || {});
    useBaseStore.setState({
      systemInfo: {
        ...(systemInfo ?? {}),
        appTitle: systemInfo?.appTitle || APP_TITLE,
      },
      containerList,
      dataBaseType: systemInfo?.containerMap?.tdengine?.envMap?.service_is_show ? ['tdengine'] : ['timescale'],
      mqttBrokeType: systemInfo?.containerMap?.emqx?.name,
      dashboardType:
        containerList.aboutUs
          ?.filter((i) => ['fuxa', 'grafana'].includes(i.name) && i.envMap?.service_is_show)
          ?.map((m) => m.name) ?? [],
    });
    if (fetchRoute) {
      fetchBaseStore?.();
    }
  });
};
