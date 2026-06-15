// /api/spawn-spots/* — spawn spot management for AI agents
// Allows users to save and reuse spawn locations by name with visual grid selection
import express from 'express';

export function registerSpawnSpotsRoutes(app, ctx) {
  const {
    db,
    authRequired,
    apiKeysRequired,
    getPortalUserByHabboUserId
  } = ctx;

  app.use('/api/spawn-spots', express.json({ limit: '1mb' }));

  // Get all spawn spots for the current user in specific room
  app.get('/api/spawn-spots/room/:roomId', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const roomId = parseInt(req.params.roomId);
      if (isNaN(roomId) || roomId < 0) {
        return res.status(400).json({ error: 'Invalid room ID' });
      }

      const habboUserId = req.user.habbo_user_id;
      const [rows] = await db.execute(
        `SELECT id, name, x, y, created_at, updated_at 
         FROM spawn_spots 
         WHERE user_id = ? AND room_id = ?
         ORDER BY name ASC`,
        [habboUserId, roomId]
      );

      res.json({ 
        ok: true, 
        spawnSpots: rows,
        roomId: roomId
      });
    } catch (err) { 
      console.error('Failed to fetch spawn spots:', err);
      res.status(500).json({ error: err.message }); 
    }
  });

  // Get all spawn spots for the current user across all rooms
  app.get('/api/spawn-spots', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const habboUserId = req.user.habbo_user_id;
      const [rows] = await db.execute(
        `SELECT id, room_id, name, x, y, created_at, updated_at 
         FROM spawn_spots 
         WHERE user_id = ?
         ORDER BY room_id ASC, name ASC`,
        [habboUserId]
      );

      res.json({ 
        ok: true, 
        spawnSpots: rows 
      });
    } catch (err) { 
      console.error('Failed to fetch spawn spots:', err);
      res.status(500).json({ error: err.message }); 
    }
  });

  // Create or update a spawn spot
  app.post('/api/spawn-spots', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const { roomId, name, x, y } = req.body;
      
      // Validate input
      if (!roomId || !name || x === undefined || y === undefined) {
        return res.status(400).json({ error: 'Missing required fields: roomId, name, x, y' });
      }
      
      const roomIdNum = parseInt(roomId);
      const xNum = parseInt(x);
      const yNum = parseInt(y);
      
      if (isNaN(roomIdNum) || roomIdNum < 0 || 
          isNaN(xNum) || xNum < 0 || xNum > 65535 ||
          isNaN(yNum) || yNum < 0 || yNum > 65535) {
        return res.status(400).json({ error: 'Invalid coordinate values' });
      }
      
      if (!name.trim() || name.length > 50) {
        return res.status(400).json({ error: 'Name must be 1-50 characters' });
      }

      const habboUserId = req.user.habbo_user_id;
      const now = new Date();

      // Check if spot with same name already exists for this user in this room
      const [existing] = await db.execute(
        `SELECT id FROM spawn_spots WHERE user_id = ? AND room_id = ? AND name = ?`,
        [habboUserId, roomIdNum, name.trim()]
      );

      if (existing.length > 0) {
        // Update existing spot
        const [result] = await db.execute(
          `UPDATE spawn_spots 
           SET x = ?, y = ?, updated_at = ?
           WHERE id = ?`,
          [xNum, yNum, now, existing[0].id]
        );

        res.json({ 
          ok: true, 
          spawnSpot: { id: existing[0].id, name, x: xNum, y: yNum, roomId: roomIdNum },
          updated: true 
        });
      } else {
        // Create new spot
        const [result] = await db.execute(
          `INSERT INTO spawn_spots (user_id, room_id, name, x, y, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [habboUserId, roomIdNum, name.trim(), xNum, yNum, now, now]
        );

        res.json({ 
          ok: true, 
          spawnSpot: { 
            id: result.insertId, 
            name: name.trim(), 
            x: xNum, 
            y: yNum, 
            roomId: roomIdNum 
          },
          created: true 
        });
      }
    } catch (err) { 
      console.error('Failed to save spawn spot:', err);
      
      if (err.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ error: 'A spawn spot with this name already exists in this room' });
      } else {
        res.status(500).json({ error: err.message }); 
      }
    }
  });

  // Delete a spawn spot
  app.delete('/api/spawn-spots/:spotId', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const spotId = parseInt(req.params.spotId);
      if (isNaN(spotId) || spotId <= 0) {
        return res.status(400).json({ error: 'Invalid spot ID' });
      }

      const habboUserId = req.user.habbo_user_id;
      
      const [result] = await db.execute(
        `DELETE FROM spawn_spots WHERE id = ? AND user_id = ?`,
        [spotId, habboUserId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          error: 'Spawn spot not found or you do not have permission to delete it' 
        });
      }

      res.json({ 
        ok: true, 
        deleted: true,
        spotId: spotId 
      });
    } catch (err) { 
      console.error('Failed to delete spawn spot:', err);
      res.status(500).json({ error: err.message }); 
    }
  });

  // Get floorplan data for a room (room layout for grid visualization)
  app.get('/api/rooms/:roomId/floorplan', authRequired, apiKeysRequired, async (req, res) => {
    try {
      const roomId = parseInt(req.params.roomId);
      if (isNaN(roomId) || roomId < 0) {
        return res.status(400).json({ error: 'Invalid room ID' });
      }

      // Get room dimensions and layout data
      // Note: This is a placeholder - actual implementation will depend on
      // emulator's room data structure
      const [roomData] = await db.execute(
        `SELECT id, name, owner_id, description, model_data
         FROM rooms 
         WHERE id = ?`,
        [roomId]
      );

      if (roomData.length === 0) {
        return res.status(404).json({ error: 'Room not found' });
      }

      // Parse room model data if it exists
      let floorplan = null;
      try {
        if (roomData[0].model_data) {
          const modelData = JSON.parse(roomData[0].model_data);
          floorplan = {
            width: modelData.width || 20,
            height: modelData.height || 20,
            tilemap: modelData.tilemap || [],
            door_x: modelData.door_x || 3,
            door_y: modelData.door_y || 3
          };
        }
      } catch (e) {
        console.warn('Failed to parse room model data:', e);
      }

      // Return basic room info with default dimensions if no floorplan available
      res.json({
        ok: true,
        room: {
          id: roomData[0].id,
          name: roomData[0].name,
          ownerId: roomData[0].owner_id
        },
        floorplan: floorplan || {
          width: 20,
          height: 20,
          tilemap: [],
          door_x: 3,
          door_y: 3
        }
      });
    } catch (err) {
      console.error('Failed to fetch room floorplan:', err);
      res.status(500).json({ error: err.message });
    }
  });
}