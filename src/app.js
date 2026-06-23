// app.js —— 应用入口,注册路由并启动

import { router } from './router.js';
import { registerPage } from './pages/register.js';
import { homePage } from './pages/home.js';
import { forumPage } from './pages/forum.js';
import { topicPage } from './pages/topic.js';
import { searchPage } from './pages/search.js';
import { newPostPage } from './pages/newpost.js';

const mount = document.getElementById('app');

// 路由表
router.add('/', homePage);
router.add('/register', registerPage);
router.add('/forum/:id', forumPage);
router.add('/topic/:id', topicPage);
router.add('/search', searchPage);
router.add('/newpost', newPostPage);

// 启动
router.start(mount);
