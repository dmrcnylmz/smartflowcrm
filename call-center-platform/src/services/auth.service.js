const { dbPrepareGet, dbPrepareAll, dbRun } = require('../config/database');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');
const { v4: uuid } = require('uuid');

class AuthService {
    login(email, password, tenantId) {
        const user = dbPrepareGet(
            'SELECT * FROM users WHERE email = ? AND tenant_id = ?',
            [email, tenantId]
        );

        if (!user) throw { status: 401, message: 'Invalid credentials' };

        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) throw { status: 401, message: 'Invalid credentials' };

        const token = generateToken(user);
        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                tenant_id: user.tenant_id
            }
        };
    }

    register(data, tenantId) {
        const id = uuid();
        const passwordHash = bcrypt.hashSync(data.password, 10);

        const existing = dbPrepareGet(
            'SELECT id FROM users WHERE email = ? AND tenant_id = ?',
            [data.email, tenantId]
        );

        if (existing) throw { status: 409, message: 'Email already registered for this tenant' };

        dbRun(
            'INSERT INTO users (id, tenant_id, name, email, password_hash, role, level) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, tenantId, data.name, data.email, passwordHash, data.role || 'agent', data.level || 1]
        );

        const user = dbPrepareGet('SELECT * FROM users WHERE id = ?', [id]);
        const token = generateToken(user);

        return {
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, tenant_id: user.tenant_id }
        };
    }
}

module.exports = new AuthService();
