import urllib.request
import uuid
import json
import numpy as np
import cv2

# Create a test sharp image
img = np.zeros((300, 300, 3), dtype=np.uint8)
img[::15, :] = [80, 200, 80]
cv2.putText(img, 'ISRO GROUND TRUTH', (20, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
_, buf = cv2.imencode('.jpg', img)

boundary = '----WebKitFormBoundary' + uuid.uuid4().hex
body = bytearray()

def add_field(name, val):
    body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{val}\r\n'.encode('utf-8'))

add_field('latitude', '30.901234')
add_field('longitude', '75.854321')
add_field('accuracy', '3.8')
add_field('lulc_class_id', '1')
add_field('lulc_class', 'Cropland')
add_field('notes', 'Punjab wheat field real-time test')
add_field('surveyor_id', 'Cadet_Tester')

# Add image
body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="field_wheat.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'.encode('utf-8'))
body.extend(buf.tobytes())
body.extend(f'\r\n--{boundary}--\r\n'.encode('utf-8'))

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/submit',
    data=bytes(body),
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
    method='POST'
)

res = urllib.request.urlopen(req)
resp_data = json.loads(res.read())
print('Upload API status:', res.status)
print('Submission ID:', resp_data['id'])
print('Saved Image URL:', resp_data['image_url'])
print('Blur Score:', resp_data['blur_score'])
print('Brightness:', resp_data['brightness'])
print('Quality Status:', resp_data['quality_status'])
print('Verification Status:', resp_data['verification_status'])
