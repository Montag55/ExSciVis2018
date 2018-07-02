#version 150
//#extension GL_ARB_shading_language_420pack : require
#extension GL_ARB_explicit_attrib_location : require

#define TASK 10
#define ENABLE_OPACITY_CORRECTION 0
#define ENABLE_LIGHTNING 0
#define ENABLE_SHADOWING 0
#define ENABLE_FRONTBACK 1

in vec3 ray_entry_position;

layout(location = 0) out vec4 FragColor;

uniform mat4 Modelview;

uniform sampler3D volume_texture;
uniform sampler2D transfer_texture;


uniform vec3    camera_location;
uniform float   sampling_distance;
uniform float   sampling_distance_ref;
uniform float   iso_value;
uniform vec3    max_bounds;
uniform ivec3   volume_dimensions;

uniform vec3    light_position;
uniform vec3    light_ambient_color;
uniform vec3    light_diffuse_color;
uniform vec3    light_specular_color;
uniform float   light_ref_coef;


bool inside_volume_bounds(const in vec3 sampling_position) {
    return (   all(greaterThanEqual(sampling_position, vec3(0.0)))
            && all(lessThanEqual(sampling_position, max_bounds)));
}

float get_sample_data(vec3 in_sampling_pos) {
    vec3 obj_to_tex = vec3(1.0) / max_bounds;
    return texture(volume_texture, in_sampling_pos * obj_to_tex).r;
}

vec3 get_gradient(vec3 sample){

  vec3 gradient;
  // float x_step = 1/volume_dimensions.x;
  // float y_step = 1/volume_dimensions.y;
  // float z_step = 1/volume_dimensions.z;
  float x_step = (max_bounds / volume_dimensions).x;
  float y_step = (max_bounds / volume_dimensions).y;
  float z_step = (max_bounds / volume_dimensions).z;

  float x_f = get_sample_data(vec3(sample.x + x_step, sample.y, sample.z));
  float x_b = get_sample_data(vec3(sample.x - x_step, sample.y, sample.z));
  gradient.x = (x_f - x_b) / (2 * x_step);

  float y_f = get_sample_data(vec3(sample.x, sample.y + y_step, sample.z));
  float y_b = get_sample_data(vec3(sample.x, sample.y - y_step, sample.z));
  gradient.y = (y_f - y_b) / (2 * y_step);

  float z_f = get_sample_data(vec3(sample.x, sample.y, sample.z + z_step));
  float z_b = get_sample_data(vec3(sample.x, sample.y, sample.z - z_step));
  gradient.z = (z_f - z_b) / (2 * z_step);

  return gradient;
}

vec3 bisection(vec3 start, vec3 end, float presision, int iterations){

  int counter = 0;
  vec3 left = start;
  vec3 right = end;
  vec3 middle = vec3(0.0, 0.0, 0.0);
  middle = (left + right)/2;
  float mid_s =  get_sample_data(middle);

  while(counter != iterations){

    if(mid_s == iso_value || counter == iterations || mid_s - iso_value <= presision || mid_s - iso_value >= -presision ){
      break;
    }
    else if(mid_s < iso_value)
      left = middle;
    else if(mid_s > iso_value)
      right = middle;

    middle = (start + end)/2;
    mid_s =  get_sample_data(middle);
    counter ++;
  }

  return middle;
}

void main() {
    /// One step trough the volume
    vec3 ray_increment      = normalize(ray_entry_position - camera_location) * sampling_distance;
    /// Position in Volume
    vec3 sampling_pos       = ray_entry_position + ray_increment; // test, increment just to be sure we are in the volume

    /// Init color of fragment
    vec4 dst = vec4(0.0, 0.0, 0.0, 0.0);

    /// check if we are inside volume
    bool inside_volume = inside_volume_bounds(sampling_pos);

    if (!inside_volume)
        discard;

#if TASK == 10
    vec4 max_val = vec4(0.0, 0.0, 0.0, 0.0);

    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume) {
        // get sample
        float s = get_sample_data(sampling_pos);

        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));

        // this is the example for maximum intensity projection
        max_val.r = max(color.r, max_val.r);
        max_val.g = max(color.g, max_val.g);
        max_val.b = max(color.b, max_val.b);
        max_val.a = max(color.a, max_val.a);

        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }

    dst = max_val;
#endif

#if TASK == 11
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    vec4 col_sum = vec4(0.0, 0.0, 0.0, 0.0);
    int itor = 0;

    while (inside_volume) {
        // get sample
        float s = get_sample_data(sampling_pos);
        vec4 color = texture(transfer_texture, vec2(s, s));
        col_sum += color;
        // increment the ray sampling position
        sampling_pos  += ray_increment;
        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
        itor++;
    }

    dst = col_sum/itor;
#endif

#if TASK == 12 || TASK == 13
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    bool do_break = false;
    while (inside_volume){

      vec3 light_ps;
      float s = get_sample_data(sampling_pos);

#if TASK == 12
        if( s - iso_value > 0){
          dst = texture(transfer_texture, vec2(s, s));
          do_break = true;
        }
#endif


#if TASK == 13 // Binary Search
        vec3 next_sampling_pos = sampling_pos + ray_increment;
        float next_s = get_sample_data(next_sampling_pos);
        if(s <= iso_value && iso_value <= next_s){
          sampling_pos = bisection(sampling_pos, next_sampling_pos, 0.00001, 100000);
          float aprox_s = get_sample_data(sampling_pos);
          dst = texture(transfer_texture, vec2(aprox_s, aprox_s));
          do_break = true;
        }
#endif

#if ENABLE_LIGHTNING == 1 // Add Shading
        if(do_break){
          vec3 light = normalize(light_position - sampling_pos);
          vec3 normal = -normalize(get_gradient(sampling_pos));
          vec3 camera = normalize(camera_location - sampling_pos);

          float diffuse = max(dot(light, normal), 0.0);
          float specular = 0.0;

          if(diffuse > 0.0) {
            vec3 half_dir    = normalize(light + normal);
            float spec_angle = max(dot(half_dir, normal), 0.0);
            specular = pow(spec_angle, light_ref_coef);
          }

          dst = vec4(light_ambient_color + diffuse * light_diffuse_color + specular * light_specular_color, 1);


  #if ENABLE_SHADOWING == 1 // Add Shadows
          vec3 s_pos = sampling_pos;

          while(inside_volume){
            s_pos += sampling_distance * light;
            float val = get_sample_data(s_pos);

            if(val - iso_value > 0){
              dst = vec4(light_ambient_color, 1);
              break;
            }

            inside_volume = inside_volume_bounds(s_pos);
          }

  #endif
}
#endif
        if(do_break){ break; }
        sampling_pos += ray_increment;
        inside_volume = inside_volume_bounds(sampling_pos);
    }
#endif

#if TASK == 31
#if ENABLE_FRONTBACK == 0
  while(inside_volume){
    sampling_pos += ray_increment;
    inside_volume = inside_volume_bounds(sampling_pos);
  }
  sampling_pos -= ray_increment;
  inside_volume = inside_volume_bounds(sampling_pos);
#endif
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    float trans = 1.0;
    while (inside_volume) {
      vec4 color = vec4(0.0);
      float s = get_sample_data(sampling_pos);
      color = texture(transfer_texture, vec2(s, s));

#if ENABLE_OPACITY_CORRECTION == 1 // Opacity Correction
      color.w = 1 - pow((1 - color.w), 255 * sampling_distance/sampling_distance_ref);
#endif

      dst.xyz += color.xyz * trans * (color.w);
      trans *= (1.0 - color.w);
      dst.w = 1.0 - trans;

      if(trans < 0.0001){
         break;
      }

#if ENABLE_FRONTBACK == 1
      sampling_pos += ray_increment;
#else
      sampling_pos -= ray_increment;
#endif


#if ENABLE_LIGHTNING == 1 // Add Shading
        vec3 light = normalize(light_position - sampling_pos);
        vec3 normal = -normalize(get_gradient(sampling_pos));
        vec3 camera = normalize(camera_location - sampling_pos);

        float diffuse = max(dot(light, normal), 0.0);
        float specular = 0.0;

        if(diffuse > 0.0) {
          vec3 half_dir    = normalize(light + normal);
          float spec_angle = max(dot(half_dir, normal), 0.0);
          specular = pow(spec_angle, light_ref_coef);
        }

        dst = vec4(light_ambient_color + diffuse * light_diffuse_color + specular * light_specular_color, 1);
#endif

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
#endif

    // return the calculated color value
    FragColor = dst;
}
