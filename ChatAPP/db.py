import sqlite3

# Path to your SQLite database file
db_path = 'db.sqlite3'

# Connect to the database
conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    # Delete all entries from bot_batchrequest table
    #cursor.execute("DELETE FROM bot_batchrequest;")
    #print("All entries from bot_batchrequest table deleted.")

    # Delete all entries from bot_batch table
    #cursor.execute("DELETE FROM bot_batch;")
    #print("All entries from bot_batch table deleted.")
    cur.execute('select custom_id, status, model, user_message, assistant_message from bot_batchrequest')
    rows = cur.fetchall()
    # Commit changes
    # conn.commit()

except sqlite3.Error as e:
    print(f"An error occurred: {e}")
    conn.rollback()

finally:
    # Close the connection
    conn.close()
    for row in rows:
        print(row)