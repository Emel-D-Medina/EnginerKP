/* UsersPanel.jsx — online users in this room */
export default function UsersPanel({ users, room }) {
  return (
    <div className="users-panel">
      <div className="users-header">
        <span className="users-room">#{room}</span>
        <span className="users-count">{users.length} en línea</span>
      </div>
      <ul className="users-list">
        {users.map((u) => (
          <li key={u} className="user-item">
            <span className="user-dot" />
            {u}
          </li>
        ))}
      </ul>
    </div>
  );
}
