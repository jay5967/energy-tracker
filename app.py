import os
import logging
from datetime import datetime
from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from werkzeug.exceptions import HTTPException
import socket
import time

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('0.0.0.0', port))
            return False
        except socket.error:
            return True

def find_available_port(start_port=5000, max_port=5010):
    for port in range(start_port, max_port):
        if not is_port_in_use(port):
            return port
    raise RuntimeError("No available ports found")

# Initialize Flask app
app = Flask(__name__)

# Configure SQLAlchemy
if os.environ.get('RENDER'):
    # Use the /opt/render/project/src directory for the database
    db_path = '/opt/render/project/src/instance/energy_tracker.db'
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    logger.info(f"Using production database at {db_path}")
else:
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///energy_tracker.db'
    logger.info("Using development database")

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Model definition
class Activity(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    energy_before = db.Column(db.Integer, nullable=False)
    energy_after = db.Column(db.Integer, nullable=False)
    duration_minutes = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    user_id = db.Column(db.String(100), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'energy_before': self.energy_before,
            'energy_after': self.energy_after,
            'duration_minutes': self.duration_minutes,
            'timestamp': self.timestamp.isoformat(),
            'user_id': self.user_id
        }

# Create tables
with app.app_context():
    try:
        logger.info("Creating database tables...")
        db.create_all()
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Error creating database tables: {str(e)}")
        # Continue execution even if there's an error
        pass

def ensure_db_schema():
    with app.app_context():
        # Check if we can access all model fields
        try:
            # Try to query all fields to verify schema is up to date
            Activity.query.with_entities(
                Activity.id, 
                Activity.name, 
                Activity.category,
                Activity.energy_before, 
                Activity.energy_after, 
                Activity.duration_minutes,
                Activity.timestamp
            ).first()
            logger.info("Database schema is up to date")
        except Exception as e:
            logger.warning(f"Schema issue detected: {str(e)}")
            logger.info("Recreating database from scratch")
            db.drop_all()
            db.create_all()
            logger.info("Database schema recreated successfully")

@app.route('/')
def index():
    try:
        logger.info("Rendering index page")
        return render_template('index.html')
    except Exception as e:
        logger.error(f"Error rendering index page: {str(e)}")
        return jsonify({'error': 'Failed to render page'}), 500

@app.route('/api/activities', methods=['GET'])
def get_activities():
    try:
        user_id = request.args.get('userId')
        logger.info(f"Fetching activities for user: {user_id}")
        
        if not user_id:
            return jsonify([])

        activities = Activity.query.filter_by(user_id=user_id).order_by(Activity.timestamp.desc()).all()
        return jsonify([activity.to_dict() for activity in activities])
    except Exception as e:
        logger.error(f"Error fetching activities: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/activities', methods=['POST'])
def create_activity():
    try:
        data = request.get_json()
        user_id = request.args.get('userId')
        
        if not user_id:
            return jsonify({"error": "User ID is required"}), 400

        activity = Activity(
            name=data['name'],
            category=data.get('category', 'Other'),
            energy_before=data['energy_before'],
            energy_after=data['energy_after'],
            duration_minutes=data['duration_minutes'],
            user_id=user_id
        )
        
        db.session.add(activity)
        db.session.commit()
        
        return jsonify(activity.to_dict())
    except Exception as e:
        logger.error(f"Error creating activity: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/activities/<int:id>', methods=['GET'])
def get_activity(id):
    try:
        logger.info(f"Fetching activity with ID: {id}")
        activity = Activity.query.get_or_404(id)
        return jsonify(activity.to_dict())
    except Exception as e:
        logger.error(f"Error fetching activity {id}: {str(e)}")
        return jsonify({'error': 'Failed to fetch activity'}), 500

@app.route('/api/activities/<int:id>', methods=['PUT'])
def update_activity(id):
    try:
        logger.info(f"Updating activity with ID: {id}")
        activity = Activity.query.get_or_404(id)
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Update fields if provided
        if 'name' in data:
            activity.name = data['name']
        if 'category' in data:
            activity.category = data['category']
        if 'energy_before' in data:
            try:
                energy_before = int(data['energy_before'])
                if not (1 <= energy_before <= 10):
                    return jsonify({'error': 'Energy before must be between 1 and 10'}), 400
                activity.energy_before = energy_before
            except ValueError:
                return jsonify({'error': 'Invalid energy_before value'}), 400
                
        if 'energy_after' in data:
            try:
                energy_after = int(data['energy_after'])
                if not (1 <= energy_after <= 10):
                    return jsonify({'error': 'Energy after must be between 1 and 10'}), 400
                activity.energy_after = energy_after
            except ValueError:
                return jsonify({'error': 'Invalid energy_after value'}), 400
                
        if 'duration_minutes' in data:
            try:
                duration_minutes = float(data['duration_minutes'])
                if duration_minutes <= 0:
                    return jsonify({'error': 'Duration must be greater than 0'}), 400
                activity.duration_minutes = duration_minutes
            except ValueError:
                return jsonify({'error': 'Invalid duration value'}), 400
        
        db.session.commit()
        logger.info(f"Successfully updated activity: {activity.name}")
        
        return jsonify(activity.to_dict())
    except Exception as e:
        logger.error(f"Error updating activity {id}: {str(e)}")
        db.session.rollback()
        return jsonify({'error': 'Failed to update activity'}), 500

@app.route('/api/activities/<int:id>', methods=['DELETE'])
def delete_activity(id):
    try:
        logger.info(f"Deleting activity with ID: {id}")
        activity = Activity.query.get_or_404(id)
        db.session.delete(activity)
        db.session.commit()
        logger.info(f"Successfully deleted activity: {activity.name}")
        return '', 204
    except Exception as e:
        logger.error(f"Error deleting activity {id}: {str(e)}")
        db.session.rollback()
        return jsonify({'error': 'Failed to delete activity'}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        user_id = request.args.get('userId')
        logger.info(f"Fetching statistics for user: {user_id}")
        
        if not user_id:
            return jsonify({
                "total_activities": 0,
                "avg_energy_change": 0,
                "most_energizing": None,
                "most_draining": None
            })

        activities = Activity.query.filter_by(user_id=user_id).all()
        
        if not activities:
            return jsonify({
                "total_activities": 0,
                "avg_energy_change": 0,
                "most_energizing": None,
                "most_draining": None
            })

        # Calculate statistics
        total = len(activities)
        energy_changes = [a.energy_after - a.energy_before for a in activities]
        avg_change = sum(energy_changes) / total if total > 0 else 0
        
        # Group by category and calculate average energy change
        category_changes = {}
        for activity in activities:
            change = activity.energy_after - activity.energy_before
            if activity.category not in category_changes:
                category_changes[activity.category] = {"total": 0, "count": 0}
            category_changes[activity.category]["total"] += change
            category_changes[activity.category]["count"] += 1

        # Find most energizing and draining categories
        category_averages = {
            cat: data["total"] / data["count"]
            for cat, data in category_changes.items()
        }
        
        most_energizing = max(category_averages.items(), key=lambda x: x[1])[0] if category_averages else None
        most_draining = min(category_averages.items(), key=lambda x: x[1])[0] if category_averages else None

        return jsonify({
            "total_activities": total,
            "avg_energy_change": round(avg_change, 2),
            "most_energizing": most_energizing,
            "most_draining": most_draining
        })
    except Exception as e:
        logger.error(f"Error calculating statistics: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.errorhandler(Exception)
def handle_error(error):
    logger.error(f"Unhandled error: {str(error)}")
    if isinstance(error, HTTPException):
        return jsonify({'error': error.description}), error.code
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Run the app
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port) 