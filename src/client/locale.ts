/**
 * Словари интерфейса и текстов подсказок «Сторожа TODO».
 * Ключи одинаковые во всех языках; `ru` — основной для автора, `en` — запасной
 * и используется в Host-текстах подсказок, `zh` — для китайского интерфейса.
 */


/** Русский словарь. */
export const ru: Record<string, string> = {
  nav: 'Сторож TODO',
  title: 'Сторож TODO',
  subtitle: 'Следит за списком задач сессии и подсказывает агенту обновить его',
  interval: 'Интервал проверки: {seconds} с',
  staleAfter: 'Устаревание: {minutes} мин',
  staleOff: 'Устаревание: выключено',

  'todos.title': 'Задачи сессии',
  'todos.empty': 'Задач нет. Агент запишет список, когда начнёт многошаговую работу.',
  'todos.pending': 'Ожидают',
  'todos.inProgress': 'В работе',
  'todos.completed': 'Готово',
  'todos.progress': 'Выполнено {done} из {total}',
  'todos.noSession': 'Откройте сессию, чтобы увидеть её список задач',

  'checks.title': 'Последняя проверка',
  'checks.never': 'Проверок ещё не было',
  'checks.at': 'Когда',
  'checks.reason': 'Причина подсказки',
  'checks.sent': 'Подсказок отправлено',
  'checks.none': 'подсказка не нужна',
  'checks.overdue': 'список пора обновить',

  'reason.stale': 'список устарел',
  'reason.all-completed': 'всё выполнено, но сессия не закрыта',
  'reason.no-todo': 'новый ход без списка задач',

  'reminder.stale': 'Список задач TODO не обновлялся больше {minutes} мин. Свежий список нужен, чтобы все видели текущий план. Обнови его через todo_write или отметь задачи выполненными.',
  'reminder.all-completed': 'Все задачи TODO отмечены выполненными, но в сессии ждёт работа. Если она ещё идёт, добавь следующий шаг в список через todo_write; если всё сделано — просто ответь без записи списка.',
  'reminder.no-todo': 'Новый ход начался без записи списка TODO. Для многошаговой работы сначала зафиксируй план через todo_write.',

  'status.live': 'Сторож включён',
  'minuteAgo': '{minutes} мин назад',
  'secondsAgo': '{seconds} с назад',
  'justNow': 'только что',
}

/** Английский словарь (запасной язык и тексты Host-подсказок). */
export const en: Record<string, string> = {
  nav: 'TODO watcher',
  title: 'TODO watcher',
  subtitle: 'Keeps the session task list current and nudges the agent to update it',
  interval: 'Checking every {seconds}s',
  staleAfter: 'Stale after {minutes} min',
  staleOff: 'Staleness check off',

  'todos.title': 'Session tasks',
  'todos.empty': 'No tasks yet. The agent records a list when it starts multi-step work.',
  'todos.pending': 'Pending',
  'todos.inProgress': 'In progress',
  'todos.completed': 'Done',
  'todos.progress': '{done} of {total} done',
  'todos.noSession': 'Open a session to see its task list',

  'checks.title': 'Last check',
  'checks.never': 'No checks yet',
  'checks.at': 'When',
  'checks.reason': 'Nudge reason',
  'checks.sent': 'Nudges sent',
  'checks.none': 'nothing to do',
  'checks.overdue': 'the list is due for an update',

  'reason.stale': 'list is stale',
  'reason.all-completed': 'all done, but the session is open',
  'reason.no-todo': 'new turn without a task list',

  'reminder.stale': 'The TODO list has not been updated for over {minutes} min. Keep it current so the plan stays visible: update it with todo_write or mark finished items completed.',
  'reminder.all-completed': 'Every TODO item is completed but the session still has pending work. If work continues, add the next step with todo_write; if everything is done, just answer without writing a list.',
  'reminder.no-todo': 'A new turn started without a TODO list. For multi-step work, record the plan with todo_write first.',

  'status.live': 'Watcher is on',
  'minuteAgo': '{minutes} min ago',
  'secondsAgo': '{seconds}s ago',
  'justNow': 'just now',
}

/** Китайский словарь. */
export const zh: Record<string, string> = {
  nav: 'TODO 守护',
  title: 'TODO 守护',
  subtitle: '守护会话任务清单，提示智能体及时更新',
  interval: '每 {seconds} 秒检查一次',
  staleAfter: '超过 {minutes} 分钟视为过期',
  staleOff: '已关闭过期检查',

  'todos.title': '会话任务',
  'todos.empty': '还没有任务。智能体开始多步工作时会记录清单。',
  'todos.pending': '待处理',
  'todos.inProgress': '进行中',
  'todos.completed': '已完成',
  'todos.progress': '已完成 {done} / {total}',
  'todos.noSession': '打开会话即可查看任务清单',

  'checks.title': '最近一次检查',
  'checks.never': '尚未检查',
  'checks.at': '时间',
  'checks.reason': '提示原因',
  'checks.sent': '已发送提示',
  'checks.none': '无需提示',
  'checks.overdue': '清单该更新了',

  'reason.stale': '清单已过期',
  'reason.all-completed': '全部完成但会话未结束',
  'reason.no-todo': '新一轮没有任务清单',

  'reminder.stale': 'TODO 清单已超过 {minutes} 分钟未更新。请用 todo_write 更新，或把已完成项标记为 completed。',
  'reminder.all-completed': '所有 TODO 都已标记完成，但会话中仍有待处理工作。如果还要继续，请用 todo_write 添加下一步；如果已完成，直接回答即可。',
  'reminder.no-todo': '新一轮开始但没有 TODO 清单。多步工作请先用 todo_write 记录计划。',

  'status.live': '守护已开启',
  'minuteAgo': '{minutes} 分钟前',
  'secondsAgo': '{seconds} 秒前',
  'justNow': '刚刚',
}
