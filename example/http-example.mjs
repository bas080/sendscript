// module.mjs

// Schema: only these functions are callable via SendScript
export const schema = [
  'login',
  'addTodo',
  'listTodos',
  'removeTodo'
];

// In-memory storage for all users
const allUsers = new Map(); // username -> user object

// Factory: creates a per-user module object
export default function perRequestWrapper(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }
  const username = auth.slice('Bearer '.length).trim();
  if (!username) throw new Error('Username required in token');

  // Reuse existing user or create new
  let user = allUsers.get(username);
  if (!user) {
    user = { username, todos: [] };
    allUsers.set(username, user);
  }

  return {
    login: async () => ({ username: user.username }),

    addTodo: async (text) => {
      if (!text) throw new Error('Todo text required');
      const todo = { id: user.todos.length + 1, text };
      user.todos.push(todo);
      return todo;
    },

    listTodos: async () => [...user.todos],

    removeTodo: async (id) => {
      const index = user.todos.findIndex(t => t.id === id);
      if (index === -1) throw new Error('Todo not found');
      const [removed] = user.todos.splice(index, 1);
      return removed;
    }
  };
}
