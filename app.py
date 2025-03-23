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

# Configure SQLAlchemy for different environments
if os.environ.get('RENDER'):
    # Production database
    db_path = '/data/energy_tracker.db'
    # Ensure the /data directory exists
    os.makedirs('/data', exist_ok=True)
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
else:
    # Development database
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///energy_tracker.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Initialize database
def init_db():
    try:
        with app.app_context():
            logger.info("Initializing database...")
            db.create_all()
            logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing database: {str(e)}")
        raise

# Initialize database on startup
init_db()

class Activity(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50))
    energy_before = db.Column(db.Integer, nullable=False)
    energy_after = db.Column(db.Integer, nullable=False)
    duration_minutes = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'energy_before': self.energy_before,
            'energy_after': self.energy_after,
            'duration_minutes': self.duration_minutes,
            'timestamp': self.timestamp.isoformat()
        }

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

# Create tables before first request
@app.before_first_request
def create_tables():
    logger.info("Creating database tables...")
    db.create_all()
    logger.info("Database tables created successfully")

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
        logger.info("Fetching activities")
        category = request.args.get('category')
        if category and category != "All Categories":
            activities = Activity.query.filter_by(category=category).all()
        else:
            activities = Activity.query.all()
        return jsonify([activity.to_dict() for activity in activities])
    except Exception as e:
        logger.error(f"Error fetching activities: {str(e)}")
        return jsonify({'error': 'Failed to fetch activities'}), 500

@app.route('/api/activities', methods=['POST'])
def create_activity():
    try:
        logger.info("Creating new activity")
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'energy_before', 'energy_after', 'duration_minutes']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 400
        
        # Validate data types and ranges
        try:
            energy_before = int(data['energy_before'])
            energy_after = int(data['energy_after'])
            duration_minutes = float(data['duration_minutes'])
            
            if not (1 <= energy_before <= 10 and 1 <= energy_after <= 10):
                return jsonify({'error': 'Energy levels must be between 1 and 10'}), 400
                
            if duration_minutes <= 0:
                return jsonify({'error': 'Duration must be greater than 0'}), 400
        except ValueError as e:
            return jsonify({'error': f'Invalid data type: {str(e)}'}), 400
        
        # Create new activity
        activity = Activity(
            name=data['name'],
            category=data.get('category'),
            energy_before=energy_before,
            energy_after=energy_after,
            duration_minutes=duration_minutes
        )
        
        db.session.add(activity)
        db.session.commit()
        logger.info(f"Successfully created activity: {activity.name}")
        
        return jsonify(activity.to_dict()), 201
    except Exception as e:
        logger.error(f"Error creating activity: {str(e)}")
        db.session.rollback()
        return jsonify({'error': 'Failed to create activity'}), 500

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

@app.route('/api/stats')
def get_stats():
    try:
        logger.info("Fetching statistics")
        activities = Activity.query.all()
        total_activities = len(activities)
        
        if total_activities == 0:
            return jsonify({
                'total_activities': 0,
                'avg_energy_change': 0,
                'most_energizing': {'category': '-', 'change': 0},
                'most_draining': {'category': '-', 'change': 0}
            })
        
        # Calculate energy changes
        energy_changes = [a.energy_after - a.energy_before for a in activities]
        avg_energy_change = sum(energy_changes) / total_activities
        
        # Calculate category statistics
        category_stats = {}
        for activity in activities:
            if not activity.category:
                continue
                
            change = activity.energy_after - activity.energy_before
            if activity.category not in category_stats:
                category_stats[activity.category] = {'total_change': 0, 'count': 0}
            category_stats[activity.category]['total_change'] += change
            category_stats[activity.category]['count'] += 1
        
        # Find most energizing and draining categories
        most_energizing = {'category': '-', 'change': 0}
        most_draining = {'category': '-', 'change': 0}
        
        for category, stats in category_stats.items():
            avg_change = stats['total_change'] / stats['count']
            if avg_change > most_energizing['change']:
                most_energizing = {'category': category, 'change': round(avg_change, 1)}
            if avg_change < most_draining['change']:
                most_draining = {'category': category, 'change': round(avg_change, 1)}
        
        return jsonify({
            'total_activities': total_activities,
            'avg_energy_change': round(avg_energy_change, 1),
            'most_energizing': most_energizing,
            'most_draining': most_draining
        })
    except Exception as e:
        logger.error(f"Error calculating statistics: {str(e)}")
        return jsonify({'error': 'Failed to calculate statistics'}), 500

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